#!/usr/bin/env node
/**
 * Suggests when the Medina book's pages and lines come in the author's recordings, for every
 * lesson of a book, as a starting point that admins correct in the app ("Zeilen bearbeiten").
 *
 *   node tools/content/madinah-book-sync.mjs 1 > apps/web/src/content/courses/madinah/book1-sync.json
 *
 * For each lesson it loads the page images and the recording from archive.org into a temporary
 * folder (ffmpeg and curl needed), finds the text lines on each page and the stretches of speech
 * in the recording with the app's own functions, and pairs them in reading order: the author
 * reads the book aloud from start to end. Only boxes and seconds are written; the images and
 * the recording are deleted again and no book text is read (ADR-0023, ADR-0025).
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { detectLines } from '../../apps/web/src/services/courses/lineDetection.ts';
import {
  fitSegments,
  speechSegments,
} from '../../apps/web/src/services/courses/pauseDetection.ts';

const WIDTH = 600;
const SAMPLE_RATE = 8000;
const PAUSE_MS = 1500;

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
 * Pairs the lines of a lesson (in reading order: page by page, top to bottom) with the
 * stretches of speech, and derives the page turns from each page's first line.
 */
export function align(pagesWithLines, segments) {
  const ordered = pagesWithLines.flatMap(({ page, boxes }) =>
    [...boxes].sort((a, b) => a[1] - b[1] || b[0] - a[0]).map((box) => ({ page, box }))
  );
  const spans = fitSegments(segments, ordered.length);
  if (spans.length !== ordered.length) return { pages: [], lines: [] };
  const lines = ordered.map((line, i) => {
    const next = spans[i + 1];
    const end = next ? Math.min(spans[i].end, next.start) : spans[i].end;
    return {
      page: line.page,
      box: line.box.map((v) => round(v, 4)),
      start: round(spans[i].start, 2),
      end: round(Math.max(end, spans[i].start + 0.1), 2),
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

function samples(file) {
  const raw = execFileSync(
    'ffmpeg',
    [
      '-v',
      'error',
      '-i',
      file,
      '-ac',
      '1',
      '-ar',
      String(SAMPLE_RATE),
      '-f',
      'f32le',
      '-',
    ],
    { maxBuffer: 512 * 1024 * 1024 }
  );
  return new Float32Array(raw.buffer, raw.byteOffset, raw.length / 4);
}

function pageImageUrl(book, page) {
  const leaf = String(page - 1).padStart(4, '0');
  return `${book.sources.archivePageImage.replace('{leaf}', leaf)}&reduce=2`;
}

async function main() {
  const bookNo = Number(process.argv[2] ?? '1');
  const book = JSON.parse(
    readFileSync(
      new URL(
        `../../apps/web/src/content/courses/madinah/book${bookNo}.json`,
        import.meta.url
      ),
      'utf8'
    )
  );
  const work = mkdtempSync(join(tmpdir(), 'madinah-sync-'));
  const lessons = [];
  try {
    for (const lesson of book.lessons) {
      const pagesWithLines = [];
      for (const page of lessonPages(book, lesson)) {
        const file = join(work, `p${page}.jpg`);
        await download(pageImageUrl(book, page), file);
        const { grey, width, height } = greyPage(file);
        rmSync(file);
        pagesWithLines.push({
          page,
          boxes: detectLines(grey, width, height).filter(readable),
        });
        await sleep(PAUSE_MS);
      }
      const audio = join(work, `l${lesson.lesson}.mp3`);
      await download(lesson.audio, audio);
      const segments = speechSegments(samples(audio), SAMPLE_RATE);
      rmSync(audio);
      const { pages, lines } = align(pagesWithLines, segments);
      process.stderr.write(
        `lesson ${lesson.lesson}: ${pagesWithLines.length} pages, ${lines.length} lines, ${segments.length} stretches\n`
      );
      lessons.push({ lesson: lesson.lesson, pages, lines });
      await sleep(PAUSE_MS);
    }
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
  const out = {
    course: 'madinah',
    book: bookNo,
    note: 'Suggested automatically (tools/content/madinah-book-sync.mjs): line boxes on the page images and the seconds they are read, matched in reading order. Only numbers, no book text. Admins correct them in the app; corrected lessons are never overwritten.',
    lessons,
  };
  process.stdout.write(`${JSON.stringify(out)}\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
