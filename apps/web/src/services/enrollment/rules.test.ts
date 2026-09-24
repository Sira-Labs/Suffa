import { describe, expect, it } from 'vitest';
import type { ExamResult, UnitEnrollment } from '@/types';
import {
  STAGES,
  STAGE_TEST_FORMAT,
  enrollmentStatus,
  isUnlocked,
  passedTest,
  stageState,
  targetDate,
} from './rules';

const exam = (unit: number, score: number, finishedAt: string) =>
  ({ units: [unit], score, total: 10, finishedAt, deleted: false }) as ExamResult;

const enrollment = (dueAt: Date, extended = false) =>
  ({ unit: 2, dueAt: dueAt.toISOString(), extended }) as UnitEnrollment;

describe('enrollment rules', () => {
  it('sets the target to the end of the day after the pace', () => {
    const due = targetDate(new Date(2026, 8, 23, 10), 14);
    expect(due.getDate()).toBe(7);
    expect(due.getMonth()).toBe(9);
    expect(due.getHours()).toBe(23);
  });

  it('unlocks a unit only with a passed test of the previous unit (≥ 80 %)', () => {
    expect(isUnlocked(1, [])).toBe(true);
    expect(isUnlocked(2, [exam(1, 7, '2026-09-20T10:00:00Z')])).toBe(false);
    expect(isUnlocked(2, [exam(1, 8, '2026-09-20T10:00:00Z')])).toBe(true);
    expect(isUnlocked(3, [exam(1, 10, '2026-09-20T10:00:00Z')])).toBe(false);
    const mixed = { ...exam(1, 10, '2026-09-20T10:00:00Z'), units: [1, 2] };
    expect(passedTest([mixed], 1)).toBeNull();
  });

  it('runs, runs over (one extension) and completes on time or late', () => {
    const now = new Date(2026, 8, 23, 12);
    const due = new Date(2026, 8, 25, 23, 59);
    expect(enrollmentStatus(undefined, [], 2, now)).toEqual({ state: 'not-started' });
    expect(enrollmentStatus(enrollment(due), [], 2, now)).toMatchObject({
      state: 'running',
      daysLeft: 2,
    });
    const late = new Date(2026, 8, 28, 12);
    expect(enrollmentStatus(enrollment(due), [], 2, late)).toMatchObject({
      state: 'overdue',
      canExtend: true,
    });
    expect(enrollmentStatus(enrollment(due, true), [], 2, late)).toMatchObject({
      canExtend: false,
    });
    expect(
      enrollmentStatus(
        enrollment(due),
        [exam(2, 9, new Date(2026, 8, 24).toISOString())],
        2
      )
    ).toMatchObject({ state: 'completed', onTime: true });
    expect(
      enrollmentStatus(
        enrollment(due),
        [exam(2, 9, new Date(2026, 8, 27).toISOString())],
        2
      )
    ).toMatchObject({ state: 'completed', onTime: false });
  });

  it('runs stage 1 until all unit tests pass, then the stage test opens stage 2', () => {
    const units1to8 = [1, 2, 3, 4, 5, 6, 7, 8].map((u) =>
      exam(u, 9, '2026-09-20T10:00:00Z')
    );
    const [stage1, stage2] = STAGES;
    expect(stageState(stage1!, [])).toEqual({ state: 'running', unitsPassed: 0 });
    expect(stageState(stage2!, [])).toEqual({ state: 'locked' });
    expect(stageState(stage1!, units1to8)).toEqual({
      state: 'test-ready',
      unitsPassed: 8,
    });
    expect(isUnlocked(9, units1to8)).toBe(false);

    const stageTest = {
      ...exam(1, 9, '2026-09-21T10:00:00Z'),
      units: [1, 2, 3],
      format: STAGE_TEST_FORMAT,
    } as ExamResult;
    expect(stageState(stage1!, [...units1to8, stageTest])).toMatchObject({
      state: 'done',
    });
    expect(stageState(stage2!, [...units1to8, stageTest])).toMatchObject({
      state: 'running',
    });
    expect(isUnlocked(9, [...units1to8, stageTest])).toBe(true);
    // A stage test is never mistaken for a unit test.
    expect(passedTest([{ ...stageTest, units: [1] } as ExamResult], 1)).toBeNull();
  });
});
