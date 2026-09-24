/**
 * Unit and stage rules (redesign v2), pure: unlocking by the previous unit's test, stages
 * with their tests, and whether a unit was finished by its target date. Soft deadlines: an
 * overdue unit stays open and only loses the on-time bonus.
 */
import type { EnrollmentEntry, ExamEntry } from './records.js';

/** Share of a unit test that counts as passed. */
export const PASS_RATIO = 0.8;
export const STAGE_TEST_FORMAT = 'stage_test';
/** Units of Book 1. */
export const BOOK_UNITS = 16;

/**
 * A level is a book; each book has two stages of eight units that end with a stage test
 * (the publisher's mid-term and final test cover the same halves).
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

const passing = (e: ExamEntry) =>
  !e.deleted && e.total > 0 && e.score / e.total >= PASS_RATIO;

const earliest = <E extends ExamEntry>(exams: E[]): E | null =>
  exams.sort((a, b) => a.finishedAt.localeCompare(b.finishedAt))[0] ?? null;

/** The first passing single-unit test of `unit`, if any. */
export function passedTest<E extends ExamEntry>(
  exams: readonly E[],
  unit: number
): E | null {
  return earliest(
    exams.filter(
      (e) =>
        passing(e) &&
        e.format !== STAGE_TEST_FORMAT &&
        e.units.length === 1 &&
        e.units[0] === unit
    )
  );
}

export function stageOf(unit: number): Stage | undefined {
  return STAGES.find((s) => s.units.includes(unit));
}

/** The first passing stage test of `stage` (format stage_test, units within the stage). */
export function stageTestPassed<E extends ExamEntry>(
  exams: readonly E[],
  stage: Stage
): E | null {
  return earliest(
    exams.filter(
      (e) =>
        passing(e) &&
        e.format === STAGE_TEST_FORMAT &&
        e.units.length > 0 &&
        e.units.every((u) => stage.units.includes(u))
    )
  );
}

export type StageState<E extends ExamEntry = ExamEntry> =
  | { state: 'locked' }
  | { state: 'running'; unitsPassed: number }
  | { state: 'test-ready'; unitsPassed: number }
  | { state: 'done'; passed: E };

export function stageState<E extends ExamEntry>(
  stage: Stage,
  exams: readonly E[]
): StageState<E> {
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
export function isUnlocked(unit: number, exams: readonly ExamEntry[]): boolean {
  if (unit <= 1) return true;
  if (!passedTest(exams, unit - 1)) return false;
  const stage = stageOf(unit);
  const previous = stage && STAGES.find((s) => s.id === stage.id - 1);
  if (stage && previous && stage.units[0] === unit) {
    return stageTestPassed(exams, previous) !== null;
  }
  return true;
}

/** Units the learner has reached (unlocked): training draws on these only. */
export function reachedUnits(exams: readonly ExamEntry[]): number[] {
  return range(1, BOOK_UNITS).filter((unit) => isUnlocked(unit, exams));
}

export type EnrollmentStatus =
  | { state: 'not-started' }
  /** `daysLeft` in calendar days; 0 = today is the last day. */
  | { state: 'running'; daysLeft: number; dueAt: Date }
  | { state: 'overdue'; daysOver: number; canExtend: boolean; dueAt: Date }
  | { state: 'completed'; onTime: boolean; passedAt: Date };

const DAY_MS = 86_400_000;

/** Calendar days from `a` to `b` (device time), e.g. today → tomorrow = 1. */
function calendarDays(a: Date, b: Date): number {
  const start = new Date(a.getFullYear(), a.getMonth(), a.getDate()).getTime();
  const end = new Date(b.getFullYear(), b.getMonth(), b.getDate()).getTime();
  return Math.round((end - start) / DAY_MS);
}

export function enrollmentStatus(
  enrollment: EnrollmentEntry | undefined,
  exams: readonly ExamEntry[],
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
    return { state: 'running', daysLeft: calendarDays(now, dueAt), dueAt };
  }
  return {
    state: 'overdue',
    daysOver: Math.max(1, calendarDays(dueAt, now)),
    canExtend: !enrollment.extended,
    dueAt,
  };
}
