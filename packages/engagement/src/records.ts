/**
 * The learning records the rules read, reduced to the fields they need. The app's synced
 * records (and the server's rows) satisfy these shapes structurally, so both sides feed the
 * same data into the same functions (ADR-0016).
 */

export type Rating = 'again' | 'hard' | 'good' | 'easy';

/** One review of an SRS card (`review_logs`). */
export interface ReviewEntry {
  cardId: string;
  rating: Rating;
  reviewedAt: string;
  /** Answer time; used by the server's plausibility checks. */
  durationMs?: number;
  /** Interval in days after this review; ≥ 21 means the card became mature. */
  scheduledInterval?: number;
  deleted?: boolean;
}

/** Listening progress of one track (`media_progress`). */
export interface TrackEntry {
  id: string;
  lessonKey: string;
  completedAt: string | null;
  deleted?: boolean;
}

/**
 * Practice repeated after the first success: a dialogue read again (`reread`, item
 * `<dialogue id>@<day>`) or a track heard to the end again (`relisten`, item
 * `<track id>@<day>`). Stored at most once per item and day; it counts for the daily quests
 * but earns no XP of its own (the first success already did).
 */
export const REPEAT_SKILLS = ['reread', 'relisten'] as const;
export type RepeatSkill = (typeof REPEAT_SKILLS)[number];

export function isRepeatSkill(skill: string): skill is RepeatSkill {
  return (REPEAT_SKILLS as readonly string[]).includes(skill);
}

/** First success with one unit practice item, or a repeat (`practice_progress`). */
export interface PracticeEntry {
  id: string;
  unit: number;
  skill: string;
  practisedAt: string;
  deleted?: boolean;
}

/** Daily check-in with the word of the day (`daily_checkins`). */
export interface CheckInEntry {
  id: string;
  checkedAt: string;
  deleted?: boolean;
}

/** A finished exam (`exam_results`). */
export interface ExamEntry {
  format: string;
  units: readonly number[];
  score: number;
  total: number;
  finishedAt: string;
  deleted?: boolean;
}

/** A started unit (`unit_enrollments`). */
export interface EnrollmentEntry {
  id: string;
  unit: number;
  dueAt: string;
  extended: boolean;
  deleted?: boolean;
}

/** Everything the engagement rules derive rewards from. */
export interface EngagementInput {
  reviews: readonly ReviewEntry[];
  tracks: readonly TrackEntry[];
  practice: readonly PracticeEntry[];
  checkIns: readonly CheckInEntry[];
  exams: readonly ExamEntry[];
  enrollments: readonly EnrollmentEntry[];
  /** lessonKey → number of tracks in the lesson (for lesson bonuses). */
  lessonSizes: ReadonlyMap<string, number>;
}
