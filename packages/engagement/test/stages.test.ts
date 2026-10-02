/** Stages per course (ADR-0025): the Medina course's stages complete through lesson tests. */
import { describe, expect, it } from 'vitest';
import {
  ALL_STAGES,
  BADGES,
  isUnlocked,
  MADINAH_STAGES,
  stageCompleted,
  stageOf,
  stagesOf,
  stageState,
  stageXpEvents,
} from '../src/index.js';
import { exam } from './fixtures.js';

/** Passing lesson tests for Medina units `from`..`to`, one day apart. */
const passLessons = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, i) =>
    exam([from + i], 9, 10, `2026-10-${String(i + 1).padStart(2, '0')}T10:00:00.000Z`)
  );

describe('stages per course', () => {
  it("lists each course's stages and keeps the first course's badge ids", () => {
    expect(stagesOf('bayna-yadayk').map((s) => s.ref)).toEqual(['stage-1', 'stage-2']);
    expect(stagesOf('madinah').map((s) => s.ref)).toEqual([
      'madinah-stage-1',
      'madinah-stage-2',
    ]);
    expect(MADINAH_STAGES.flatMap((s) => s.units)).toEqual(
      Array.from({ length: 23 }, (_, i) => 101 + i)
    );
    expect(stageOf(113)?.ref).toBe('madinah-stage-2');
    expect(new Set(ALL_STAGES.map((s) => s.ref)).size).toBe(ALL_STAGES.length);
    for (const stage of ALL_STAGES) {
      expect(BADGES.find((b) => b.id === stage.ref)?.arabic).toBe(stage.arabic);
    }
  });

  it('completes a Medina stage with its last lesson test, without a stage test', () => {
    const [one, two] = MADINAH_STAGES as [
      (typeof MADINAH_STAGES)[0],
      (typeof MADINAH_STAGES)[0],
    ];
    const eleven = passLessons(101, 111);
    expect(stageCompleted(eleven, one)).toBeNull();
    expect(stageState(one, eleven)).toEqual({ state: 'running', unitsPassed: 11 });
    expect(stageState(two, eleven)).toEqual({ state: 'locked' });

    const twelve = passLessons(101, 112);
    expect(stageCompleted(twelve, one)?.finishedAt).toBe('2026-10-12T10:00:00.000Z');
    expect(stageState(one, twelve).state).toBe('done');
    expect(stageState(two, twelve)).toEqual({ state: 'running', unitsPassed: 0 });
    // The date is the latest lesson test, also when an early lesson was passed last.
    const late = exam([101], 10, 10, '2026-11-01T10:00:00.000Z');
    expect(stageCompleted([...passLessons(102, 112), late], one)).toBe(late);
    expect(stageXpEvents(twelve)).toEqual([
      {
        at: '2026-10-12T10:00:00.000Z',
        points: 250,
        kind: 'stage',
        ref: 'madinah-stage-1',
      },
    ]);
  });

  it('opens the first unit of every course', () => {
    expect(isUnlocked(101, [])).toBe(true);
    expect(isUnlocked(102, [])).toBe(false);
    expect(isUnlocked(102, passLessons(101, 101))).toBe(true);
    expect(isUnlocked(113, passLessons(101, 112))).toBe(true);
  });
});
