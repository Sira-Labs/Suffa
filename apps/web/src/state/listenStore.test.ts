import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/services/storage';
import { useListenStore, type TrackRef } from './listenStore';

const track = (id: string): TrackRef => ({
  id,
  url: `https://example/${id}.mp3`,
  lessonKey: 'b1/u1/l1',
  lessonSize: 2,
});

describe('listen store', () => {
  beforeEach(async () => {
    await db.media_progress.clear();
    await useListenStore.getState().load();
  });

  it('adds up played time and counts a track as heard at 85 %', async () => {
    const { record } = useListenStore.getState();
    expect(await record(track('t1'), 30, 60)).toMatchObject({ trackHeard: false });
    expect(await record(track('t1'), 20, 60)).toMatchObject({ trackHeard: false });
    const outcome = await record(track('t1'), 2, 60);
    expect(outcome).toEqual({ trackHeard: true, lessonComplete: false, xp: 5 });
    expect(useListenStore.getState().progress['t1']!.completedAt).not.toBeNull();
    // Listening again does not pay twice.
    expect(await record(track('t1'), 60, 60)).toMatchObject({ trackHeard: false, xp: 0 });
  });

  it('reports the lesson as complete with its last track', async () => {
    const { record } = useListenStore.getState();
    await record(track('t1'), 60, 60);
    const outcome = await record(track('t2'), 55, 60);
    expect(outcome).toEqual({ trackHeard: true, lessonComplete: true, xp: 20 });
  });

  it('persists progress and ignores invalid input', async () => {
    const { record } = useListenStore.getState();
    expect(await record(track('t1'), 10, Number.NaN)).toMatchObject({
      trackHeard: false,
    });
    await record(track('t1'), 10, 60);
    await useListenStore.getState().load();
    expect(useListenStore.getState().progress['t1']!.listenedSec).toBe(10);
  });

  it('does not lose time when two saves overlap', async () => {
    const { record } = useListenStore.getState();
    await Promise.all([record(track('t1'), 30, 60), record(track('t1'), 25, 60)]);
    expect(useListenStore.getState().progress['t1']!.listenedSec).toBe(55);
    expect(useListenStore.getState().progress['t1']!.completedAt).not.toBeNull();
  });
});
