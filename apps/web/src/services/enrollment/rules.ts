/**
 * Unit enrollment rules (redesign v2, step 2): pace → target date and one extension. The
 * rules rewards depend on (unlocking, stages, on-time) live in @suffa/engagement, so the
 * server computes them the same way; they are re-exported here for the app.
 */
import type { UnitPace } from '@/types';

export {
  BOOK_UNITS,
  PASS_RATIO,
  STAGE_TEST_FORMAT,
  STAGES,
  enrollmentStatus,
  isUnlocked,
  passedTest,
  reachedUnits,
  stageOf,
  stageState,
  stageTestPassed,
  type EnrollmentStatus,
  type Stage,
  type StageState,
} from '@suffa/engagement';

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

export function enrollmentId(book: number, unit: number): string {
  return `b${book}-u${unit}`;
}

/** End of the local day `days` days after `start`. */
export function targetDate(start: Date, days: number): Date {
  const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + days);
  d.setHours(23, 59, 59, 999);
  return d;
}
