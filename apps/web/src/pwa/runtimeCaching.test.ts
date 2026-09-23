import { describe, expect, it } from 'vitest';
import index from '@/content/sources/book1-audio.json';
import { NETWORK_ONLY_PATTERN } from './runtimeCaching';

describe('service worker runtime routes', () => {
  it('never routes the publisher audio through the service worker', () => {
    const urls = index.units.flatMap((u) =>
      u.lessons.flatMap((l) => l.tracks.map((t) => t.url))
    );
    expect(urls.length).toBeGreaterThan(0);
    expect(urls.filter((url) => NETWORK_ONLY_PATTERN.test(url))).toEqual([]);
  });

  it('keeps YouTube online-only', () => {
    expect(NETWORK_ONLY_PATTERN.test('https://www.youtube.com/embed/abc')).toBe(true);
    expect(NETWORK_ONLY_PATTERN.test('https://i.ytimg.com/vi/abc/0.jpg')).toBe(true);
  });
});
