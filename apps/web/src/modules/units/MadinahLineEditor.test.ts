import { describe, expect, it } from 'vitest';
import { linesFromDrafts, suggestTimes, type DraftLine } from './MadinahLineEditor';

const draft = (id: number, page: number, y: number, start: number | null): DraftLine => ({
  id,
  page,
  box: [0.1, y, 0.8, 0.04],
  start,
});

describe('line editor', () => {
  it('saves timed lines in order, each ending where the next begins', () => {
    const lines = linesFromDrafts(
      [
        draft(1, 2, 0.3, 10),
        draft(2, 2, 0.1, 2),
        draft(3, 2, 0.5, null),
        draft(4, 3, 0.1, 20),
      ],
      [{ start: 20, end: 23.5 }]
    );
    expect(lines.map((l) => [l.page, l.start, l.end])).toEqual([
      [2, 2, 10],
      [2, 10, 20],
      [3, 20, 23.5],
    ]);
  });

  it('keeps a saved end, but never past the next line', () => {
    const lines = linesFromDrafts(
      [
        { ...draft(1, 2, 0.1, 1), end: 9 },
        draft(2, 3, 0.1, 31),
        { ...draft(3, 3, 0.2, 35), end: 50 },
        draft(4, 3, 0.3, 40),
      ],
      []
    );
    expect(lines.map((l) => [l.start, l.end])).toEqual([
      [1, 9],
      [31, 35],
      [35, 40],
      [40, 44],
    ]);
  });

  it('gives the last line a few seconds when no pause tells its end', () => {
    expect(linesFromDrafts([draft(1, 2, 0.1, 5)], [])[0]).toMatchObject({
      start: 5,
      end: 9,
    });
  });

  it('suggests one stretch of speech per line, within each page’s time, top to bottom', () => {
    const drafts = [
      draft(1, 2, 0.5, null),
      draft(2, 2, 0.1, null),
      draft(3, 3, 0.2, null),
    ];
    const pages = [
      { page: 2, at: 0 },
      { page: 3, at: 30 },
    ];
    const segments = [
      { start: 1, end: 4 },
      { start: 5, end: 9 },
      { start: 9.2, end: 12 },
      { start: 31, end: 35 },
    ];
    const suggested = suggestTimes(drafts, pages, segments);
    const startOf = (id: number) => suggested.find((d) => d.id === id)?.start;
    // Page 2 has two lines and three stretches: the two closest are joined.
    expect(startOf(2)).toBe(1);
    expect(startOf(1)).toBe(5);
    expect(startOf(3)).toBe(31);
  });
});
