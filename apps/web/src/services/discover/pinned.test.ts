import { describe, expect, it } from 'vitest';
import type { DiscoverItem, DiscoverProgress } from '@/types';
import { pinnedEntries } from './catalog';

const item = (id: string) =>
  ({ type: 'video', id, title: id, why: '', minutes: null }) as DiscoverItem;
const state = (id: string, openedAt: string, pinned = true) =>
  ({ id: `yt/${id}`, startedAt: openedAt, openedAt, pinned }) as DiscoverProgress;

describe('pinnedEntries', () => {
  it('lists pinned, unseen items with the last opened first', () => {
    const items = [item('a'), item('b'), item('c'), item('d')];
    const progress = Object.fromEntries(
      [
        state('a', '2026-09-20T10:00:00Z'),
        state('b', '2026-09-24T10:00:00Z'),
        state('c', '2026-09-23T10:00:00Z', false),
        state('d', '2026-09-22T10:00:00Z'),
      ].map((p) => [p.id, p])
    );
    const seen = (i: DiscoverItem) => i.id === 'd';
    expect(pinnedEntries(items, progress, seen).map((i) => i.id)).toEqual(['b', 'a']);
  });
});
