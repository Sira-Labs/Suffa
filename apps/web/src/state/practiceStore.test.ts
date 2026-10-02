import Dexie from 'dexie';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db, practiceRepo } from '@/services/storage';
import { usePracticeStore } from './practiceStore';

describe('practice store', () => {
  beforeEach(async () => {
    await db.practice_progress.clear();
    await usePracticeStore.getState().load();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('rewards the first success per item and detects the completed station', async () => {
    const { practise } = usePracticeStore.getState();
    const items = ['w1', 'w2'];
    expect(await practise(1, 'write', 'w1', items)).toEqual({
      first: true,
      stationComplete: false,
      xp: 2,
    });
    expect(await practise(1, 'write', 'w1', items)).toMatchObject({
      first: false,
      xp: 0,
    });
    expect(await practise(1, 'write', 'w2', items)).toMatchObject({
      first: true,
      stationComplete: true,
    });
  });

  it('persists records across reloads', async () => {
    await usePracticeStore.getState().practise(2, 'read', 'd1', ['d1']);
    usePracticeStore.setState({ records: {}, loaded: false });
    await usePracticeStore.getState().load();
    expect(Object.keys(usePracticeStore.getState().records)).toEqual(['2:read:d1']);
  });

  it('forgets an item IndexedDB could not store, and gives no XP for it', async () => {
    const { practise } = usePracticeStore.getState();
    await practise(3, 'write', 'w1', ['w1', 'w2']);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(practiceRepo, 'put').mockRejectedValueOnce(
      new Dexie.QuotaExceededError('storage full')
    );
    expect(await practise(3, 'write', 'w2', ['w1', 'w2'])).toEqual({
      first: false,
      stationComplete: false,
      xp: 0,
    });
    // The saved item stays; the unsaved one counts again on the next answer.
    expect(Object.keys(usePracticeStore.getState().records)).toEqual(['3:write:w1']);
    expect(await practise(3, 'write', 'w2', ['w1', 'w2'])).toEqual({
      first: true,
      stationComplete: true,
      xp: 2,
    });
  });

  it('does not swallow errors that are not storage errors', async () => {
    vi.spyOn(practiceRepo, 'put').mockRejectedValueOnce(new TypeError('bug'));
    await expect(
      usePracticeStore.getState().practise(4, 'read', 'd1', [])
    ).rejects.toThrow('bug');
    expect(usePracticeStore.getState().records['4:read:d1']).toBeUndefined();
  });

  it('reports the completed station only once every item is stored', async () => {
    const { practise } = usePracticeStore.getState();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const put = vi.spyOn(practiceRepo, 'put');
    // Two quick answers that complete the station: the first write fails after the second
    // one was stored.
    let failFirst: (error: Error) => void = () => {};
    put.mockImplementationOnce(
      () => new Promise<void>((_, reject) => (failFirst = reject)) as never
    );
    const first = practise(5, 'write', 'w1', ['w1', 'w2']);
    const second = await practise(5, 'write', 'w2', ['w1', 'w2']);
    expect(second).toMatchObject({ first: true, stationComplete: false });
    failFirst(new Dexie.QuotaExceededError('storage full'));
    expect(await first).toMatchObject({ first: false, stationComplete: false });

    // Both stored: the write that settles last reports the completed station.
    let storeLater: () => void = () => {};
    put.mockImplementationOnce(
      () => new Promise<void>((resolve) => (storeLater = resolve)) as never
    );
    const again = practise(5, 'write', 'w1', ['w1', 'w2']);
    await Promise.resolve();
    storeLater();
    expect(await again).toMatchObject({ first: true, stationComplete: true });
  });
});
