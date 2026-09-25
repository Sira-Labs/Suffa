import { describe, expect, it } from 'vitest';
import {
  enrollmentStatus,
  isUnlocked,
  passedTest,
  reachedUnits,
  STAGES,
  stageOf,
  stageState,
  stageTestPassed,
} from '../src/index.js';
import { exam } from './fixtures.js';

const passUnits = (to: number) =>
  Array.from({ length: to }, (_, i) =>
    exam([i + 1], 9, 10, `2026-09-${String(i + 1).padStart(2, '0')}T10:00:00.000Z`)
  );
const stage1 = exam(
  [1, 2, 3, 4, 5, 6, 7, 8],
  40,
  50,
  '2026-09-20T10:00:00.000Z',
  'stage_test'
);

describe('unit and stage rules', () => {
  it('takes the first passing unit test and ignores failed, deleted and mixed ones', () => {
    const early = exam([3], 8, 10, '2026-09-02T00:00:00.000Z');
    const exams = [
      exam([3], 9, 10, '2026-09-05T00:00:00.000Z'),
      early,
      exam([3], 7, 10, '2026-09-01T00:00:00.000Z'),
      exam([3], 10, 10, '2026-08-01T00:00:00.000Z', 'mixed_chapter', true),
      exam([3, 4], 10, 10, '2026-08-01T00:00:00.000Z'),
      exam([3], 0, 0, '2026-08-01T00:00:00.000Z'),
      exam([3], 10, 10, '2026-08-01T00:00:00.000Z', 'stage_test'),
    ];
    expect(passedTest(exams, 3)).toBe(early);
    expect(passedTest(exams, 4)).toBeNull();
  });

  it('opens units one after another, the next stage only after its test', () => {
    expect(isUnlocked(1, [])).toBe(true);
    expect(isUnlocked(2, [])).toBe(false);
    expect(reachedUnits(passUnits(3))).toEqual([1, 2, 3, 4]);
    expect(isUnlocked(9, passUnits(8))).toBe(false);
    expect(isUnlocked(9, [...passUnits(8), stage1])).toBe(true);
    expect(isUnlocked(10, [...passUnits(9), stage1])).toBe(true);
    expect(stageOf(12)?.id).toBe(2);
    expect(stageOf(17)).toBeUndefined();
  });

  it('walks a stage from locked to done', () => {
    const [one, two] = STAGES as [(typeof STAGES)[0], (typeof STAGES)[0]];
    expect(stageState(two, [])).toEqual({ state: 'locked' });
    expect(stageState(one, passUnits(2))).toEqual({ state: 'running', unitsPassed: 2 });
    expect(stageState(one, passUnits(8))).toEqual({
      state: 'test-ready',
      unitsPassed: 8,
    });
    expect(stageState(one, [stage1])).toEqual({ state: 'done', passed: stage1 });
    expect(stageTestPassed([exam([1, 9], 50, 50, 'x', 'stage_test')], one)).toBeNull();
    expect(stageTestPassed([exam([], 50, 50, 'x', 'stage_test')], one)).toBeNull();
  });

  it('tells running, overdue and completed units apart', () => {
    const enrollment = {
      id: 'b1-u1',
      unit: 1,
      dueAt: '2026-09-10T21:59:59.999Z',
      extended: false,
    };
    expect(enrollmentStatus(undefined, [], 1)).toEqual({ state: 'not-started' });
    const running = enrollmentStatus(enrollment, [], 1, new Date('2026-09-08T10:00:00Z'));
    expect(running).toMatchObject({ state: 'running', daysLeft: 2 });
    const overdue = enrollmentStatus(enrollment, [], 1, new Date('2026-09-13T10:00:00Z'));
    expect(overdue).toMatchObject({ state: 'overdue', daysOver: 3, canExtend: true });
    const late = enrollmentStatus(
      { ...enrollment, extended: true },
      [],
      1,
      new Date('2026-09-11T00:30:00Z')
    );
    expect(late).toMatchObject({ state: 'overdue', daysOver: 1, canExtend: false });
    const onTime = [exam([1], 9, 10, '2026-09-09T10:00:00.000Z')];
    expect(enrollmentStatus(enrollment, onTime, 1)).toMatchObject({
      state: 'completed',
      onTime: true,
    });
    expect(enrollmentStatus(undefined, onTime, 1)).toMatchObject({ onTime: false });
  });
});
