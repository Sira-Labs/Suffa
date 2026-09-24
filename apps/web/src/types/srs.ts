/**
 * Types of the syncable learning data.
 *
 * Every syncable record extends `Syncable`:
 *   - id:         UUID (stable across devices)
 *   - updated_at: ISO timestamp (basis for last-write-wins, see ADR-0002)
 *   - deleted:    soft-delete flag (tombstone) so deletions can be synced
 */

export interface Syncable {
  id: string;
  updated_at: string;
  deleted: boolean;
}

/** Rating during active recall (mapped to an SM-2 quality behind the scenes). */
export type ReviewRating = 'again' | 'hard' | 'good' | 'easy';

/** Which aspect of a vocabulary word/item is trained. */
export type CardKind =
  | 'vocab_ar_de'
  | 'vocab_de_ar'
  | 'plural'
  | 'root_to_word'
  | 'nisba'
  | 'conjugation'
  | 'minimalpair';

/**
 * SRS card state (SM-2/FSRS style). `contentRef` points to static content
 * (e.g. a vocabulary ID); the static content itself is not synced.
 */
export interface SrsCard extends Syncable {
  contentRef: string;
  kind: CardKind;
  /** Days until the next due date. */
  interval: number;
  /** Ease factor (SM-2), minimum 1.3. */
  ease: number;
  /** Number of consecutive successful reviews. */
  reps: number;
  /** Number of lapses. */
  lapses: number;
  /** ISO date (UTC) of the next due date. */
  due: string;
  /** ISO timestamp of the last review, null if never studied. */
  lastReviewed: string | null;
  /** Set automatically when the card counts as "difficult" (mistake log). */
  leech: boolean;
}

export interface ReviewLog extends Syncable {
  cardId: string;
  contentRef: string;
  kind: CardKind;
  rating: ReviewRating;
  /** Response time in milliseconds (for speed/metacognition analysis). */
  durationMs: number;
  /** Interval (days) AFTER this review. */
  scheduledInterval: number;
  reviewedAt: string;
}

export type ExamFormat =
  | 'vocab_ar_de'
  | 'vocab_de_ar'
  | 'plural'
  | 'root'
  | 'conjugation'
  | 'listening'
  | 'reading'
  | 'writing'
  | 'speaking'
  | 'minimalpair'
  | 'mixed_chapter'
  | 'speed'
  | 'adaptive'
  /** Test at the end of a stage (units 1–8 or 9–16), step 3 of the unit room. */
  | 'stage_test';

export interface ExamItemResult {
  contentRef: string;
  format: ExamFormat;
  prompt: string;
  expected: string;
  given: string;
  correct: boolean;
  durationMs: number;
}

export interface ExamResult extends Syncable {
  format: ExamFormat;
  /** For mixed chapter exams: the units included. */
  units: number[];
  score: number;
  total: number;
  items: ExamItemResult[];
  startedAt: string;
  finishedAt: string;
}

/** Freely extensible settings store (one record per user). */
export interface SettingsRecord extends Syncable {
  /** Singleton key, always 'user-settings'. */
  key: 'user-settings';
  tashkilLevel: TashkilLevel;
  theme: 'dark' | 'light';
  arabicFontScale: number;
  dailyGoal: number;
  showTransliteration: boolean;
  dialectNotes: boolean;
}

export type TashkilLevel = 'full' | 'partial' | 'none';

/**
 * User-created content (own vocabulary). Unlike the static teaching content,
 * it is synced because it is created per user.
 */
export interface UserVocab extends Syncable {
  ar: string;
  tr: string;
  de: string;
  wurzel: string;
  wazn?: string;
  plural?: string | null;
  einheit: number;
  hinweis?: string;
}

/** A table that is synced. */
export type SyncTable =
  | 'srs_cards'
  | 'review_logs'
  | 'exam_results'
  | 'settings'
  | 'user_vocab'
  | 'practice_progress'
  | 'unit_enrollments'
  | 'daily_checkins'
  | 'discover_progress'
  | 'media_progress';
