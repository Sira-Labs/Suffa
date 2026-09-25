import type {
  EngagementInput,
  ExamEntry,
  PracticeEntry,
  Rating,
  ReviewEntry,
  TrackEntry,
} from '../src/index.js';

export const TZ = 'Europe/Zurich';

export const review = (
  cardId: string,
  rating: Rating,
  reviewedAt: string,
  extra: Partial<ReviewEntry> = {}
): ReviewEntry => ({ cardId, rating, reviewedAt, ...extra });

export const track = (
  id: string,
  lessonKey: string,
  completedAt: string | null,
  deleted = false
): TrackEntry => ({ id, lessonKey, completedAt, deleted });

export const practice = (
  id: string,
  skill: string,
  practisedAt: string,
  deleted = false
): PracticeEntry => ({ id, unit: 1, skill, practisedAt, deleted });

export const exam = (
  units: number[],
  score: number,
  total: number,
  finishedAt: string,
  format = 'mixed_chapter',
  deleted = false
): ExamEntry => ({ format, units, score, total, finishedAt, deleted });

export const empty = (): EngagementInput => ({
  reviews: [],
  tracks: [],
  practice: [],
  checkIns: [],
  exams: [],
  enrollments: [],
  lessonSizes: new Map(),
});

/** `n` reviews of distinct cards, one second apart, from `start`. */
export function reviews(
  n: number,
  start: string,
  rating: Rating = 'good',
  prefix = 'c'
): ReviewEntry[] {
  const t0 = Date.parse(start);
  return Array.from({ length: n }, (_, i) =>
    review(`${prefix}${i}`, rating, new Date(t0 + i * 1000).toISOString())
  );
}
