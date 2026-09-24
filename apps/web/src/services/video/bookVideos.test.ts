import { describe, expect, it } from 'vitest';
import type { BookPages, BookVideoIndex } from '@/types';
import { embedUrl, pageLabel, unitPageRange, videosForUnit } from './bookVideos';

const pages: BookPages = {
  book: 1,
  status: 'estimated',
  lastPage: 100,
  unitStartPages: { '1': 1, '2': 26, '3': 55 },
};

const index: BookVideoIndex = {
  source: { publisher: 'p', playlist: 'l', rights: 'r', retrieved: '2026-09-23' },
  book: 1,
  videos: [
    { id: 'a', page: 3, title: 'Page 3' },
    { id: 'b', page: 25, title: 'Page 25' },
    { id: 'c', page: 26, title: 'Page 26' },
    { id: 'd', page: 32, title: 'Lesson 12', approx: true },
    { id: 'e', page: 100, title: 'Page 100' },
  ],
};

describe('book videos', () => {
  it('derives a unit page range from the next unit start or the last page', () => {
    expect(unitPageRange(pages, 1)).toEqual({ from: 1, to: 25 });
    expect(unitPageRange(pages, 3)).toEqual({ from: 55, to: 100 });
    expect(unitPageRange(pages, 9)).toBeNull();
  });

  it('assigns every video to exactly one unit by page', () => {
    const data = { index, pages };
    expect(videosForUnit(data, 1)?.videos.map((v) => v.id)).toEqual(['a', 'b']);
    expect(videosForUnit(data, 2)).toMatchObject({ from: 26, to: 54, estimated: true });
    expect(videosForUnit(data, 2)?.videos.map((v) => v.id)).toEqual(['c', 'd']);
    expect(videosForUnit(data, 3)?.videos.map((v) => v.id)).toEqual(['e']);
  });

  it('embeds without cookies and marks placed pages', () => {
    expect(embedUrl(index.videos[0]!, true)).toBe(
      'https://www.youtube-nocookie.com/embed/a?rel=0&autoplay=1'
    );
    expect(pageLabel(index.videos[0]!)).toBe('S. 3');
    expect(pageLabel(index.videos[3]!)).toBe('S. ~32');
  });
});
