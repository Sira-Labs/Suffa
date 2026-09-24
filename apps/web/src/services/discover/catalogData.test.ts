import { describe, expect, it } from 'vitest';
import catalog from '@/content/sources/discover.json';
import type { DiscoverCatalog } from '@/types';
import { CATEGORY_LABELS, entries } from './catalog';

const data = catalog as DiscoverCatalog;

/** Guards the hand-curated catalog: every entry is complete and points at YouTube ids. */
describe('curated discover catalog', () => {
  it('has channels in every category with complete, unique entries', () => {
    const categories = new Set(data.channels.map((c) => c.category));
    expect([...categories].sort()).toEqual(Object.keys(CATEGORY_LABELS).sort());
    const all = entries(data);
    expect(new Set(all.map((e) => e.id)).size).toBe(all.length);
    for (const e of all) {
      expect(
        e.type === 'video' ? /^[\w-]{11}$/.test(e.id) : /^PL[\w-]+$/.test(e.id)
      ).toBe(true);
      expect(e.title.length).toBeGreaterThan(3);
      expect(e.why.length).toBeGreaterThan(3);
    }
    for (const c of data.channels) {
      expect(c.url).toMatch(/^https:\/\/www\.youtube\.com\/@/);
      expect(c.channelId).toMatch(/^UC[\w-]{22}$/);
      expect(c.level).toMatch(/^\d(-\d)?$/);
    }
  });

  it('keeps the owner-requested channels', () => {
    const handles = data.channels.map((c) => c.handle);
    expect(handles).toEqual(expect.arrayContaining(['@Arabic101', '@LearnArabicKhasu']));
  });
});
