#!/usr/bin/env node
/**
 * Suggests when the Medina book's pages and lines come in the author's recordings, for every
 * lesson of a book, as a starting point that admins correct in the app ("Zeilen bearbeiten").
 *
 *   pip install -r tools/content/requirements.txt   # and: ffmpeg, curl, tesseract (ara)
 *   node tools/content/madinah-book-sync.mjs 1 > apps/web/src/content/courses/madinah/book1-sync.json
 *
 * For each lesson it loads the page images and the recording from archive.org into a temporary
 * folder and
 * - finds the text lines on each page with the app's own line detection (pictures left out),
 * - reads each line with Tesseract (Arabic; SUFFA_TESSDATA may name a folder with the more
 *   accurate tessdata_best model),
 * - recognises the recording's words with their seconds, locally (speech_words.py, Whisper),
 * - and matches the two letter by letter (textAlign.mjs): a line starts when its letters are
 *   first said. The reader repeats lines and announces exercises; that speech matches nothing
 *   and is passed over. Boxes whose text is never heard (pictures, page furniture) are dropped.
 *
 * Only boxes and seconds are written. The images, the recording, the OCR text and the
 * recognised words stay in the temporary folder and are deleted (ADR-0023, ADR-0025); with
 * SUFFA_SYNC_CACHE set, the recognised words are kept there instead so a rerun can skip
 * recognition.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { detectLines } from '../../apps/web/src/services/courses/lineDetection.ts';
import { letters, lineTimes } from './textAlign.mjs';

const WIDTH = 600;
const PAUSE_MS = 1500;
/** A line stays marked until the next one starts, unless the next is this far off. */
const HOLD_SECONDS = 8;
/** How long a line stays marked after its last letter when the next one is far off. */
const TAIL_SECONDS = 1.5;
/** Padding around a line's box when it is cut out for OCR, as a fraction of the page. */
const CROP_PAD = 0.008;

const round = (n, digits) => Math.round(n * 10 ** digits) / 10 ** digits;

/** The book's pages of a lesson: from its start to the page before the next lesson. */
export function lessonPages(book, lesson) {
  const next = book.lessons.find((l) => l.lesson === lesson.lesson + 1);
  const last = next ? next.page - 1 : book.pages;
  return Array.from({ length: last - lesson.page + 1 }, (_, i) => lesson.page + i);
}

/**
 * Boxes nobody reads aloud: specks and the page number centred under the text.
 */
export function readable([x, y, w, h]) {
  if (w < 0.03 || h < 0.008) return false;
  const centre = x + w / 2;
  const pageNumber = w < 0.15 && y > 0.75 && centre > 0.4 && centre < 0.6;
  return !pageNumber;
}

/**
 * Page turns and line marks from the lines in reading order (`ordered`: page and box) and
 * the seconds each was found at (`times`, null when it was not heard). Each page turns when
 * its first heard line starts; a line ends where the next begins, unless that is far off.
 */
export function timedSync(ordered, times) {
  const heard = [];
  ordered.forEach((line, i) => {
    const t = times[i];
    if (!t) return;
    // A line found before the one above it is a misreading of a repeated phrase.
    if (heard.length > 0 && t.start <= heard[heard.length - 1].start) return;
    heard.push({ ...line, ...t });
  });
  const lines = heard.map((line, i) => {
    const next = heard[i + 1];
    let end =
      next && next.start - line.end <= HOLD_SECONDS
        ? next.start
        : line.end + TAIL_SECONDS;
    if (next) end = Math.min(end, next.start);
    return {
      page: line.page,
      box: line.box.map((v) => round(v, 4)),
      start: round(line.start, 2),
      end: round(Math.max(end, line.start + 0.1), 2),
    };
  });
  const pages = [];
  for (const line of lines) {
    if (pages.some((p) => p.page === line.page)) continue;
    const at = pages.length === 0 ? 0 : line.start;
    if (pages.length > 0 && at <= pages[pages.length - 1].at) continue;
    pages.push({ page: line.page, at });
  }
  return { pages, lines };
}

/** Downloads with patience: archive.org answers 5xx now and then under load. */
async function download(url, file) {
  for (let attempt = 1; ; attempt++) {
    try {
      execFileSync('curl', ['-sSfL', '--max-time', '180', '-o', file, url]);
      return;
    } catch (error) {
      if (attempt >= 6) throw error;
      process.stderr.write(`  retry ${attempt} for ${url}\n`);
      await sleep(5000 * attempt);
    }
  }
}

function greyPage(file) {
  const raw = execFileSync(
    'ffmpeg',
    [
      '-v',
      'error',
      '-i',
      file,
      '-vf',
      `scale=${WIDTH}:-1`,
      '-f',
      'rawvideo',
      '-pix_fmt',
      'gray',
      '-',
    ],
    { maxBuffer: 64 * 1024 * 1024 }
  );
  return { grey: raw, width: WIDTH, height: raw.length / WIDTH };
}

function imageSize(file) {
  return execFileSync('ffprobe', [
    '-v',
    'error',
    '-select_streams',
    'v',
    '-show_entries',
    'stream=width,height',
    '-of',
    'csv=p=0',
    file,
  ])
    .toString()
    .trim()
    .split(',')
    .map(Number);
}

function tesseract(file, psm) {
  const tessdata = process.env.SUFFA_TESSDATA;
  return execFileSync(
    'tesseract',
    [
      file,
      '-',
      ...(tessdata ? ['--tessdata-dir', tessdata] : []),
      '-l',
      'ara',
      '--psm',
      psm,
    ],
    { stdio: ['ignore', 'pipe', 'ignore'] }
  )
    .toString()
    .trim();
}

/** The text of each box on a page image, read as a single line (else as a block). */
function readBoxes(file, boxes, work) {
  const [w, h] = imageSize(file);
  const crop = join(work, 'line.png');
  return boxes.map(([x, y, bw, bh]) => {
    const left = Math.max(0, Math.round((x - CROP_PAD) * w));
    const top = Math.max(0, Math.round((y - CROP_PAD) * h));
    const cw = Math.min(w - left, Math.round((bw + 2 * CROP_PAD) * w));
    const ch = Math.min(h - top, Math.round((bh + 2 * CROP_PAD) * h));
    execFileSync('ffmpeg', [
      '-v',
      'error',
      '-y',
      '-i',
      file,
      '-vf',
      `crop=${cw}:${ch}:${left}:${top},format=gray`,
      crop,
    ]);
    const text = tesseract(crop, '7');
    return letters(text).length >= 2 ? text : tesseract(crop, '6');
  });
}

function speechWords(audio) {
  const script = fileURLToPath(new URL('./speech_words.py', import.meta.url));
  const out = execFileSync(
    process.env.SUFFA_WHISPER_PYTHON ?? 'python3',
    [script, audio],
    {
      maxBuffer: 256 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'inherit'],
    }
  );
  return JSON.parse(out.toString());
}

function pageImageUrl(book, page) {
  const leaf = String(page - 1).padStart(4, '0');
  return book.sources.archivePageImage.replace('{leaf}', leaf);
}

async function main() {
  const bookNo = Number(process.argv[2] ?? '1');
  const only = process.argv[3] ? Number(process.argv[3]) : null;
  const book = JSON.parse(
    readFileSync(
      new URL(
        `../../apps/web/src/content/courses/madinah/book${bookNo}.json`,
        import.meta.url
      ),
      'utf8'
    )
  );
  const cache = process.env.SUFFA_SYNC_CACHE;
  const work = mkdtempSync(join(tmpdir(), 'madinah-sync-'));
  const lessons = [];
  try {
    for (const lesson of book.lessons) {
      if (only !== null && lesson.lesson !== only) continue;
      const ordered = [];
      const texts = [];
      for (const page of lessonPages(book, lesson)) {
        const file = join(work, `p${page}.jpg`);
        await download(pageImageUrl(book, page), file);
        const { grey, width, height } = greyPage(file);
        const boxes = detectLines(grey, width, height)
          .filter(readable)
          .sort((a, b) => a[1] - b[1] || b[0] - a[0]);
        texts.push(...readBoxes(file, boxes, work));
        ordered.push(...boxes.map((box) => ({ page, box })));
        rmSync(file);
        await sleep(PAUSE_MS);
      }
      const cached = cache && join(cache, `words-b${bookNo}-l${lesson.lesson}.json`);
      let words;
      if (cached && existsSync(cached)) {
        words = JSON.parse(readFileSync(cached, 'utf8'));
      } else {
        const audio = join(work, `l${lesson.lesson}.mp3`);
        await download(lesson.audio, audio);
        words = speechWords(audio);
        rmSync(audio);
        if (cached) writeFileSync(cached, JSON.stringify(words));
      }
      const { pages, lines } = timedSync(ordered, lineTimes(texts, words));
      process.stderr.write(
        `lesson ${lesson.lesson}: ${ordered.length} boxes, ${lines.length} heard, ${pages.length} page turns, ${words.length} words\n`
      );
      lessons.push({ lesson: lesson.lesson, pages, lines });
    }
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
  const out = {
    course: 'madinah',
    book: bookNo,
    note: 'Suggested automatically (tools/content/madinah-book-sync.mjs): line boxes on the page images and the seconds they are read, found by matching the lines (OCR) with the recording (local speech recognition). Only numbers, no book text. Admins correct them in the app; corrected lessons are never overwritten.',
    lessons,
  };
  process.stdout.write(`${JSON.stringify(out)}\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
