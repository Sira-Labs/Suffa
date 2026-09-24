#!/usr/bin/env node
/**
 * Builds the index of the publisher's official audio for one book of
 * Al-Arabiyya bayna Yadayk (Arabic for All, https://arabicforall.net).
 *
 *   node tools/content/publisher-audio-index.mjs 1 > apps/web/src/content/sources/book1-audio.json
 *
 * Only titles and links are stored: the audio stays on the publisher's server ("all rights
 * reserved") and is streamed from there (ADR-0023). The crawl is polite: one request at a
 * time with a pause, and it only reads the public index pages.
 */
import { setTimeout as sleep } from 'node:timers/promises';

const BASE = 'https://old.arabicforall.net';
const PAUSE_MS = 700;

/** Track kinds, recognised from the Arabic track title. Order matters (first match wins). */
const KINDS = [
  ['listening', /فهم المسموع/],
  ['sounds', /الأصوات/],
  ['exercise-example', /المثال/],
  ['exercise', /التدريب/],
  ['vocabulary', /مفردات/],
  ['dialogue', /الحوار/],
  ['exam', /السؤال|أولا|ثانيا|ثالثا|رابعا|خامسا|سادسا/],
];

export function trackKind(title) {
  return KINDS.find(([, pattern]) => pattern.test(title))?.[0] ?? 'other';
}

const decode = (s) =>
  s
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();

async function get(url) {
  for (let attempt = 1; ; attempt += 1) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
      return await res.text();
    } catch (error) {
      if (attempt >= 3) throw error;
      await sleep(2000 * attempt);
    }
  }
}

/** Links of the form …/sounds/audio/<book>/<unit>[/<lesson>] with their label. */
function links(html, pathPattern) {
  const out = new Map();
  const re = new RegExp(
    `href="${BASE}/sounds/audio/${pathPattern}"[^>]*>([\\s\\S]*?)</a>`,
    'g'
  );
  for (const m of html.matchAll(re)) out.set(Number(m[1]), decode(m[2]));
  return out;
}

/**
 * MP3 links with the nearest text before each link as its title. With `unit`, links to another
 * unit's folder are dropped: the publisher's page for unit 12, lesson 105 also links a unit 14
 * file by mistake.
 */
export function parseTracks(html, unit) {
  const tracks = [];
  const seen = new Set();
  for (const m of html.matchAll(
    /https?:\/\/[^"'\s]*?sounds\/\w+_Audio_Book\/[^"'\s]+?\.mp3/g
  )) {
    const url = m[0].replace(/^http:/, 'https:');
    const folder = url.match(/\/unit(\d+)\//);
    if (unit && folder && Number(folder[1]) !== unit) continue;
    if (seen.has(url)) continue;
    seen.add(url);
    const before = html.slice(Math.max(0, m.index - 600), m.index);
    const texts = [...before.matchAll(/>([^<>]{3,120})</g)]
      .map((t) => decode(t[1]))
      .filter((t) => t && !t.startsWith('http'));
    const raw = texts.at(-1) ?? '';
    const numbered = raw.match(/^(\d+)\s*(.*)$/);
    const title = (numbered ? numbered[2] : raw).trim();
    tracks.push({
      n: numbered ? Number(numbered[1]) : tracks.length + 1,
      title,
      kind: trackKind(title),
      url,
    });
  }
  return tracks;
}

async function main() {
  const book = Number(process.argv[2] ?? '1');
  if (!Number.isInteger(book) || book < 1 || book > 4) {
    console.error('usage: publisher-audio-index.mjs <book 1-4>');
    process.exit(2);
  }
  const indexUrl = `${BASE}/ar/sounds/audio/${book}`;
  const unitLinks = links(await get(indexUrl), `${book}/(\\d+)`);
  const units = [];
  for (const [unit, unitTitle] of [...unitLinks].sort(([a], [b]) => a - b)) {
    await sleep(PAUSE_MS);
    const unitHtml = await get(`${BASE}/ar/sounds/audio/${book}/${unit}`);
    const lessonLinks = links(unitHtml, `${book}/${unit}/(\\d+)`);
    const lessons = [];
    if (lessonLinks.size === 0) {
      lessons.push({ lesson: 0, title: unitTitle, tracks: parseTracks(unitHtml) });
    }
    for (const [lesson, lessonTitle] of [...lessonLinks].sort(([a], [b]) => a - b)) {
      await sleep(PAUSE_MS);
      const html = await get(`${BASE}/ar/sounds/audio/${book}/${unit}/${lesson}`);
      lessons.push({ lesson, title: lessonTitle, tracks: parseTracks(html, unit) });
    }
    const isExam = !/الوحدة/.test(unitTitle);
    units.push({ unit, title: unitTitle, kind: isExam ? 'exam' : 'unit', lessons });
    const count = lessons.reduce((n, l) => n + l.tracks.length, 0);
    console.error(
      `unit ${unit} ${unitTitle}: ${lessons.length} lessons, ${count} tracks`
    );
  }
  const index = {
    source: {
      publisher: 'Arabic for All (العربية للجميع)',
      index: indexUrl,
      rights:
        "All rights reserved by the publisher. Streamed from the publisher's server, never copied (ADR-0023).",
      retrieved: new Date().toISOString().slice(0, 10),
    },
    book,
    units,
  };
  process.stdout.write(`${JSON.stringify(index, null, 2)}\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
