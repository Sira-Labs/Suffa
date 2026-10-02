/**
 * Unit and stage rules (redesign v2), pure: unlocking by the previous unit's test, stages
 * with their tests, and whether a unit was finished by its target date. Soft deadlines: an
 * overdue unit stays open and only loses the on-time bonus.
 */
import { courseOfUnit, type CourseId } from './courses.js';
import type { EnrollmentEntry, ExamEntry } from './records.js';

/** Share of a unit test that counts as passed. */
export const PASS_RATIO = 0.8;
export const STAGE_TEST_FORMAT = 'stage_test';
/** Units of Book 1. */
export const BOOK_UNITS = 16;

/**
 * A level is a book, split into stages that each end with a badge (ADR-0025: per course).
 * Al-Arabiyya bayna Yadayk: two stages of eight units, each closed by a stage test (the
 * publisher's mid-term and final test cover the same halves). Medina course: a stage is done
 * once every lesson test in it is passed; it has no separate stage test.
 */
export interface Stage {
  /** Number within the course (1, 2, …). */
  id: number;
  course: CourseId;
  book: number;
  units: readonly number[];
  /** Learner-facing names (German). */
  name: string;
  /** The stage test, or null when passing all lesson tests completes the stage. */
  test: string | null;
  badge: string;
  /** The badge in Arabic. */
  arabic: string;
  /** Badge id and XP reference ("stage-1" stays as stored before courses existed). */
  ref: string;
}

const range = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, i) => from + i);

/** Al-Arabiyya bayna Yadayk, Book 1. */
export const STAGES: readonly Stage[] = [
  {
    id: 1,
    course: 'bayna-yadayk',
    book: 1,
    units: range(1, 8),
    name: 'Etappe 1',
    test: 'Zwischentest',
    badge: 'Grundstein',
    arabic: 'حَجَر الأساس',
    ref: 'stage-1',
  },
  {
    id: 2,
    course: 'bayna-yadayk',
    book: 1,
    units: range(9, 16),
    name: 'Etappe 2',
    test: 'Abschlusstest',
    badge: 'Buch 1',
    arabic: 'الكِتاب الأوَّل',
    ref: 'stage-2',
  },
];

/** Medina course, Book 1: lessons 1–12 and 13–23 (units 101–112, 113–123). */
export const MADINAH_STAGES: readonly Stage[] = [
  {
    id: 1,
    course: 'madinah',
    book: 1,
    units: range(101, 112),
    name: 'Etappe 1',
    test: null,
    badge: 'Erste Schritte',
    arabic: 'الخُطُواتُ الأُولى',
    ref: 'madinah-stage-1',
  },
  {
    id: 2,
    course: 'madinah',
    book: 1,
    units: range(113, 123),
    name: 'Etappe 2',
    test: null,
    badge: 'Medina Buch 1',
    arabic: 'كِتابُ المَدِينَةِ الأوَّل',
    ref: 'madinah-stage-2',
  },
];

/** Every course's stages (badges and stage XP cover all of them). */
export const ALL_STAGES: readonly Stage[] = [...STAGES, ...MADINAH_STAGES];

/** The stages of one course, in order. */
export function stagesOf(course: CourseId): readonly Stage[] {
  return ALL_STAGES.filter((s) => s.course === course);
}

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
  return ALL_STAGES.find((s) => s.units.includes(unit));
}

/** The stage before `stage` in its course, if any. */
function previousStage(stage: Stage): Stage | undefined {
  return ALL_STAGES.find((s) => s.course === stage.course && s.id === stage.id - 1);
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

/**
 * When `stage` was completed: its first passing stage test, or, for a stage without one, the
 * lesson test that passed its last open lesson. Null while it is not complete.
 */
export function stageCompleted<E extends ExamEntry>(
  exams: readonly E[],
  stage: Stage
): E | null {
  if (stage.test !== null) return stageTestPassed(exams, stage);
  const passed = stage.units.map((u) => passedTest(exams, u));
  if (passed.some((p) => p === null)) return null;
  // Every stage has units, so there is at least one passed test to compare.
  return (passed as E[]).reduce((latest, e) =>
    e.finishedAt.localeCompare(latest.finishedAt) > 0 ? e : latest
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
  const passed = stageCompleted(exams, stage);
  if (passed) return { state: 'done', passed };
  const previous = previousStage(stage);
  if (previous && !stageCompleted(exams, previous)) return { state: 'locked' };
  const unitsPassed = stage.units.filter((u) => passedTest(exams, u)).length;
  return unitsPassed === stage.units.length
    ? { state: 'test-ready', unitsPassed }
    : { state: 'running', unitsPassed };
}

/**
 * The first unit of a course is always open; every further unit opens with the previous unit's
 * test, and the first unit of a stage also needs the previous stage's test.
 */
export function isUnlocked(unit: number, exams: readonly ExamEntry[]): boolean {
  if (unit <= 1 || courseOfUnit(unit)?.units[0] === unit) return true;
  if (!passedTest(exams, unit - 1)) return false;
  const stage = stageOf(unit);
  const previous = stage && previousStage(stage);
  if (stage && previous && stage.units[0] === unit) {
    return stageCompleted(exams, previous) !== null;
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
