import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/services/storage';
import { usePracticeStore } from './practiceStore';

describe('practice store', () => {
  beforeEach(async () => {
    await db.practice_progress.clear();
    await usePracticeStore.getState().load();
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
});
