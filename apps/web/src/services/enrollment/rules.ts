/**
 * Unit enrollment rules (redesign v2, step 2), pure: pace → target date, one extension,
 * unlocking by the previous unit's test, and the on-time bonus. Soft deadlines: an overdue
 * unit stays open; the learner loses the on-time bonus and the teacher can see it.
 */
import type { ExamResult, UnitEnrollment, UnitPace } from '@/types';

export const PACE_DAYS: Record<UnitPace, number> = {
  relaxed: 21,
  normal: 14,
  intensive: 7,
};
export const PACE_LABELS: Record<UnitPace, { label: string; minutes: string }> = {
  relaxed: { label: 'Locker', minutes: 'ca. 15 Min. am Tag' },
  normal: { label: 'Normal', minutes: 'ca. 25 Min. am Tag' },
  intensive: { label: 'Intensiv', minutes: 'ca. 45 Min. am Tag' },
};
export const EXTENSION_DAYS = 7;
/** Share of a unit test that counts as passed. */
export const PASS_RATIO = 0.8;

export function enrollmentId(book: number, unit: number): string {
  return `b${book}-u${unit}`;
}

/** End of the local day `days` days after `start`. */
export function targetDate(start: Date, days: number): Date {
  const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + days);
  d.setHours(23, 59, 59, 999);
  return d;
}

/** The first passing single-unit test of `unit`, if any. */
export function passedTest(
  exams: readonly ExamResult[],
  unit: number
): ExamResult | null {
  return (
    exams
      .filter(
        (e) =>
          !e.deleted &&
          e.format !== STAGE_TEST_FORMAT &&
          e.units.length === 1 &&
          e.units[0] === unit &&
          e.total > 0 &&
          e.score / e.total >= PASS_RATIO
      )
      .sort((a, b) => a.finishedAt.localeCompare(b.finishedAt))[0] ?? null
  );
}

/**
 * Levels and stages (step 3): a level is a book, each book has two stages of eight units that
 * end with a stage test (the publisher's mid-term and final test cover the same halves).
 */
export interface Stage {
  id: number;
  book: number;
  units: readonly number[];
  /** Learner-facing names (German). */
  name: string;
  test: string;
  badge: string;
}

export const STAGE_TEST_FORMAT = 'stage_test';

const range = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, i) => from + i);

export const STAGES: readonly Stage[] = [
  {
    id: 1,
    book: 1,
    units: range(1, 8),
    name: 'Etappe 1',
    test: 'Zwischentest',
    badge: 'Grundstein',
  },
  {
    id: 2,
    book: 1,
    units: range(9, 16),
    name: 'Etappe 2',
    test: 'Abschlusstest',
    badge: 'Buch 1',
  },
];

export function stageOf(unit: number): Stage | undefined {
  return STAGES.find((s) => s.units.includes(unit));
}

/** The first passing stage test of `stage` (format stage_test, units within the stage). */
export function stageTestPassed(
  exams: readonly ExamResult[],
  stage: Stage
): ExamResult | null {
  return (
    exams
      .filter(
        (e) =>
          !e.deleted &&
          e.format === STAGE_TEST_FORMAT &&
          e.units.length > 0 &&
          e.units.every((u) => stage.units.includes(u)) &&
          e.total > 0 &&
          e.score / e.total >= PASS_RATIO
      )
      .sort((a, b) => a.finishedAt.localeCompare(b.finishedAt))[0] ?? null
  );
}

export type StageState =
  | { state: 'locked' }
  | { state: 'running'; unitsPassed: number }
  | { state: 'test-ready'; unitsPassed: number }
  | { state: 'done'; passed: ExamResult };

export function stageState(stage: Stage, exams: readonly ExamResult[]): StageState {
  const passed = stageTestPassed(exams, stage);
  if (passed) return { state: 'done', passed };
  const previous = STAGES.find((s) => s.id === stage.id - 1);
  if (previous && !stageTestPassed(exams, previous)) return { state: 'locked' };
  const unitsPassed = stage.units.filter((u) => passedTest(exams, u)).length;
  return unitsPassed === stage.units.length
    ? { state: 'test-ready', unitsPassed }
    : { state: 'running', unitsPassed };
}

/**
 * Unit 1 is always open; every further unit opens with the previous unit's test, and the
 * first unit of a stage also needs the previous stage's test.
 */
export function isUnlocked(unit: number, exams: readonly ExamResult[]): boolean {
  if (unit <= 1) return true;
  if (!passedTest(exams, unit - 1)) return false;
  const stage = stageOf(unit);
  const previous = stage && STAGES.find((s) => s.id === stage.id - 1);
  if (stage && previous && stage.units[0] === unit) {
    return stageTestPassed(exams, previous) !== null;
  }
  return true;
}

export type EnrollmentStatus =
  | { state: 'not-started' }
  /** `daysLeft` in calendar days; 0 = today is the last day. */
  | { state: 'running'; daysLeft: number; dueAt: Date }
  | { state: 'overdue'; daysOver: number; canExtend: boolean; dueAt: Date }
  | { state: 'completed'; onTime: boolean; passedAt: Date };

const DAY_MS = 86_400_000;

/** Calendar days from `a` to `b` (local time), e.g. today → tomorrow = 1. */
function calendarDays(a: Date, b: Date): number {
  const start = new Date(a.getFullYear(), a.getMonth(), a.getDate()).getTime();
  const end = new Date(b.getFullYear(), b.getMonth(), b.getDate()).getTime();
  return Math.round((end - start) / DAY_MS);
}

export function enrollmentStatus(
  enrollment: UnitEnrollment | undefined,
  exams: readonly ExamResult[],
  unit: number,
  now: Date = new Date()
): EnrollmentStatus {
  const passed = passedTest(exams, unit);
  if (passed) {
    const passedAt = new Date(passed.finishedAt);
    const onTime = !!enrollment && passedAt <= new Date(enrollment.dueAt);
    return { state: 'completed', onTime, passedAt };
  }
  if (!enrollment) return { state: 'not-started' };
  const dueAt = new Date(enrollment.dueAt);
  if (now <= dueAt) {
    return {
      state: 'running',
      daysLeft: calendarDays(now, dueAt),
      dueAt,
    };
  }
  return {
    state: 'overdue',
    daysOver: Math.max(1, calendarDays(dueAt, now)),
    canExtend: !enrollment.extended,
    dueAt,
  };
}
