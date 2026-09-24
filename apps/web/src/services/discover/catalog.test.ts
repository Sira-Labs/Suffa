import { describe, expect, it } from 'vitest';
import type { DiscoverItem } from '@/types';
import { discoverEmbedUrl, isoWeek, levelIncludes, weeklyPick } from './catalog';

describe('discover catalog helpers', () => {
  it('reads level ranges', () => {
    expect(levelIncludes('1', 1)).toBe(true);
    expect(levelIncludes('1-2', 2)).toBe(true);
    expect(levelIncludes('2-3', 1)).toBe(false);
    expect(levelIncludes('', 1)).toBe(false);
  });

  it('picks the same item for a whole ISO week', () => {
    expect(isoWeek(new Date(2026, 8, 21))).toBe(isoWeek(new Date(2026, 8, 27)));
    expect(isoWeek(new Date(2026, 8, 28))).toBe(isoWeek(new Date(2026, 8, 21)) + 1);
    const items = ['a', 'b', 'c'];
    expect(weeklyPick(items, new Date(2026, 8, 21))).toBe(
      weeklyPick(items, new Date(2026, 8, 27))
    );
    expect(weeklyPick([], new Date())).toBeUndefined();
  });

  it('embeds videos and playlists without cookies', () => {
    const video = { type: 'video', id: 'abc' } as DiscoverItem;
    const list = { type: 'playlist', id: 'PL1' } as DiscoverItem;
    expect(discoverEmbedUrl(video)).toBe(
      'https://www.youtube-nocookie.com/embed/abc?rel=0&autoplay=1'
    );
    expect(discoverEmbedUrl(list)).toBe(
      'https://www.youtube-nocookie.com/embed/videoseries?list=PL1&rel=0&autoplay=1'
    );
  });
});
