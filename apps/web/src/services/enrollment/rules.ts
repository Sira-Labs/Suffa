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
          e.units.length === 1 &&
          e.units[0] === unit &&
          e.total > 0 &&
          e.score / e.total >= PASS_RATIO
      )
      .sort((a, b) => a.finishedAt.localeCompare(b.finishedAt))[0] ?? null
  );
}

/** Unit 1 is always open; every further unit opens with the previous unit's test. */
export function isUnlocked(unit: number, exams: readonly ExamResult[]): boolean {
  return unit <= 1 || passedTest(exams, unit - 1) !== null;
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
