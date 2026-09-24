import type { Syncable } from './srs';

/** Pace chosen when starting a unit; sets the target date. */
export type UnitPace = 'relaxed' | 'normal' | 'intensive';

/**
 * A started unit (redesign v2, step 2): chosen pace, target date and whether the one
 * extension was used. Completion is derived from exam results, never stored.
 */
export interface UnitEnrollment extends Syncable {
  /** `b${book}-u${unit}` */
  id: string;
  book: number;
  unit: number;
  pace: UnitPace;
  startedAt: string;
  /** End of the target day (local time), ISO. */
  dueAt: string;
  /** The single extension was used. */
  extended: boolean;
}
