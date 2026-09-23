#!/usr/bin/env node
/**
 * Builds the index of the publisher's page-by-page videos for Book 1 of Al-Arabiyya bayna
 * Yadayk (YouTube channel "العربية للجميع", playlist "Arabic course – Book 1").
 *
 *   node tools/content/publisher-video-index.mjs > apps/web/src/content/sources/book1-videos.json
 *
 * Only video ids, titles and book page numbers are stored: the videos are embedded with
 * YouTube's standard player, never downloaded (ADR-0023). It reads the public playlist page and
 * its continuation (YouTube serves 100 entries per request).
 */
import { setTimeout as sleep } from 'node:timers/promises';

export const PLAYLIST_ID = 'PL67C39551FF78271B';
const PLAYLIST_URL = `https://www.youtube.com/playlist?list=${PLAYLIST_ID}`;

/** "Arabic course - Book 1 :Page 28 - At Your Hands" → 28; titles of other books → null. */
export function pageOf(title) {
  if (/Book\s*[2-4]\b/i.test(title)) return null;
  const match = title.match(/Page\s*(\d+)/i);
  return match ? Number(match[1]) : null;
}

/** Playlist entries (id + title) and the continuation token from one playlist response. */
export function parseEntries(data) {
  const entries = [];
  let continuation = null;
  (function walk(node) {
    if (!node || typeof node !== 'object') return;
    const lockup = node.lockupViewModel;
    if (lockup?.contentId) {
      entries.push({
        id: lockup.contentId,
        title: lockup.metadata?.lockupMetadataViewModel?.title?.content ?? '',
      });
    }
    // The first continuation is the playlist's; later ones belong to other panels.
    if (node.continuationCommand && !continuation) {
      continuation = node.continuationCommand.token;
    }
    for (const key of Object.keys(node)) walk(node[key]);
  })(data);
  return { entries, continuation };
}

/**
 * Videos in page order. Entries without a page in their title ("Book 1: Lesson 12") get the
 * page between their playlist neighbours and `approx: true`; other books' videos are dropped.
 */
export function toVideos(entries) {
  const videos = [];
  entries.forEach((entry, i) => {
    if (/Book\s*[2-4]\b/i.test(entry.title)) return;
    const page = pageOf(entry.title);
    if (page !== null) {
      videos.push({ id: entry.id, page, title: entry.title });
      return;
    }
    const before = entries
      .slice(0, i)
      .reverse()
      .map((e) => pageOf(e.title))
      .find(Boolean);
    const after = entries
      .slice(i + 1)
      .map((e) => pageOf(e.title))
      .find(Boolean);
    if (!before && !after) return;
    const guess = before && after ? Math.round((before + after) / 2) : (before ?? after);
    videos.push({ id: entry.id, page: guess, title: entry.title, approx: true });
  });
  // Exact pages first, then placed ones; the playlist order breaks remaining ties.
  return videos.sort(
    (a, b) => a.page - b.page || Number(!!a.approx) - Number(!!b.approx)
  );
}

/** The playlist page; YouTube occasionally serves a variant without data, so retry. */
async function playlistPage() {
  for (let attempt = 1; ; attempt += 1) {
    const res = await fetch(PLAYLIST_URL, { headers: { 'accept-language': 'en' } });
    const html = await res.text();
    const initial = html.match(/var ytInitialData = (\{.*?\});<\/script>/s);
    const clientVersion = html.match(/"INNERTUBE_CLIENT_VERSION":"([^"]+)"/)?.[1];
    if (res.ok && initial && clientVersion)
      return { data: JSON.parse(initial[1]), clientVersion };
    if (attempt >= 3)
      throw new Error(`Playlist page not recognised (HTTP ${res.status})`);
    await sleep(2000 * attempt);
  }
}

async function main() {
  const { data, clientVersion } = await playlistPage();
  let { entries, continuation } = parseEntries(data);
  while (continuation) {
    const res = await fetch('https://www.youtube.com/youtubei/v1/browse', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        context: { client: { clientName: 'WEB', clientVersion, hl: 'en' } },
        continuation,
      }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} for playlist continuation`);
    const next = parseEntries(await res.json());
    entries = entries.concat(next.entries);
    continuation = next.continuation;
  }
  const videos = toVideos(entries);
  console.error(`${entries.length} playlist entries, ${videos.length} Book 1 videos`);
  const index = {
    source: {
      publisher: 'Arabic for All (العربية للجميع)',
      playlist: PLAYLIST_URL,
      rights:
        "All rights reserved by the publisher. Embedded with YouTube's player, never copied (ADR-0023).",
      retrieved: new Date().toISOString().slice(0, 10),
    },
    book: 1,
    videos,
  };
  process.stdout.write(`${JSON.stringify(index, null, 2)}\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
