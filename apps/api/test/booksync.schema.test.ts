import { describe, expect, it } from 'vitest';
import { validateBookSync } from '../src/booksync/schema.js';

const line = (start: number, end: number, page = 2) => ({
  page,
  box: [0.1, 0.2, 0.8, 0.05],
  start,
  end,
});

describe('book sync validation', () => {
  it('accepts page starts and lines in order, rounded', () => {
    const result = validateBookSync({
      pages: [
        { page: 2, at: 0 },
        { page: 3, at: 61.23456 },
      ],
      lines: [line(1, 4.5), line(4.5, 9.123456)],
    });
    expect(result).toEqual({
      ok: true,
      data: {
        pages: [
          { page: 2, at: 0 },
          { page: 3, at: 61.23 },
        ],
        lines: [line(1, 4.5), line(4.5, 9.12)],
      },
    });
  });

  it('defaults to no lines', () => {
    expect(validateBookSync({ pages: [] })).toEqual({
      ok: true,
      data: { pages: [], lines: [] },
    });
  });

  it('refuses pages out of order, empty or reversed lines and boxes off the page', () => {
    const result = validateBookSync({
      pages: [
        { page: 2, at: 10 },
        { page: 3, at: 10 },
      ],
      lines: [
        line(5, 4),
        { page: 2, box: [0.5, 0.5, 0.6, 0.1], start: 6, end: 7 },
        line(1, 2),
      ],
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues).toEqual([
      'pages.1: starts before the page before',
      'lines.0: ends before it starts',
      'lines.1: box outside the page',
      'lines.2: starts before the line before',
    ]);
  });

  it('refuses unknown fields and values out of range', () => {
    for (const input of [
      { pages: [{ page: 0, at: 0 }] },
      { pages: [{ page: 2, at: -1 }] },
      { pages: [{ page: 2, at: 1, text: 'من هذا' }] },
      { pages: [], lines: [{ page: 2, box: [0, 0, 2, 0.1], start: 0, end: 1 }] },
      { pages: [], notes: 'x' },
    ]) {
      expect(validateBookSync(input).ok, JSON.stringify(input)).toBe(false);
    }
  });
});
