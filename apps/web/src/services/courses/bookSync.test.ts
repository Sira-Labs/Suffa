import { describe, expect, it, vi } from 'vitest';
import { lineAt, loadBookSync, pageAt, type SyncLine } from './bookSync';

const pages = [
  { page: 2, at: 0 },
  { page: 3, at: 30 },
  { page: 4, at: 60 },
];

const line = (start: number, end: number): SyncLine => ({
  page: 2,
  box: [0.1, 0.1, 0.8, 0.05],
  start,
  end,
});

function memoryStorage() {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
  };
}

describe('book sync', () => {
  it('finds the page the recording is on', () => {
    expect(pageAt(pages, 0)).toBe(2);
    expect(pageAt(pages, 29.9)).toBe(2);
    expect(pageAt(pages, 30)).toBe(3);
    expect(pageAt(pages, 1000)).toBe(4);
    expect(pageAt([{ page: 5, at: 10 }], 5)).toBeNull();
    expect(pageAt([], 5)).toBeNull();
  });

  it('finds the line being read, none between lines', () => {
    const lines = [line(1, 3), line(3, 5), line(6, 8)];
    expect(lineAt(lines, 0.5)).toBeNull();
    expect(lineAt(lines, 1)).toBe(0);
    expect(lineAt(lines, 3)).toBe(1);
    expect(lineAt(lines, 5.5)).toBeNull();
    expect(lineAt(lines, 7.9)).toBe(2);
    expect(lineAt(lines, 8)).toBeNull();
  });

  it('keeps the last answer for offline use and ignores malformed ones', async () => {
    const storage = memoryStorage();
    const answer = {
      course: 'madinah',
      book: 1,
      lessons: [{ lesson: 1, revision: 1, pages, lines: [] }],
    };
    const online = vi.fn(async () => new Response(JSON.stringify(answer)));
    expect(await loadBookSync('madinah', 1, { fetchImpl: online, storage })).toEqual(
      answer
    );

    const offline = vi.fn(async () => {
      throw new TypeError('offline');
    });
    expect(await loadBookSync('madinah', 1, { fetchImpl: offline, storage })).toEqual(
      answer
    );

    const broken = vi.fn(async () => new Response(JSON.stringify({ lessons: 'x' })));
    expect(await loadBookSync('madinah', 1, { fetchImpl: broken, storage })).toEqual(
      answer
    );
    expect(await loadBookSync('madinah', 2, { fetchImpl: offline, storage })).toBeNull();
  });
});
