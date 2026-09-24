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

/** First success with one unit practice item (`practice_progress`). */
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
