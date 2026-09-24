/**
 * Plausibility checks before the server recomputes rewards (ADR-0016). The app computes XP
 * on the device and could be tampered with; the server's copy only counts what a person can
 * really do. Dropped records stay in the synced tables (they are the learner's data); they
 * only earn nothing.
 */
import type { EngagementInput, ReviewEntry } from '@suffa/engagement';

/** Answers faster than this are not recall (0 = not measured, as in old app versions). */
export const MIN_ANSWER_MS = 500;
/** At most this many reviews in any minute. */
export const MAX_REVIEWS_PER_MINUTE = 30;
/** At most this many practice items in any minute. */
export const MAX_PRACTICE_PER_MINUTE = 30;
/** The same card again within this time is a double submit. */
export const DUPLICATE_WINDOW_MS = 2_000;
/** Clocks drift a little; anything later than this is from the future. */
export const CLOCK_SKEW_MS = 5 * 60_000;
/** Exams longer than this are not a real test. */
export const MAX_EXAM_ITEMS = 500;

export type RejectReason = 'future' | 'too-fast' | 'duplicate' | 'rate' | 'invalid-score';

export interface PlausibilityResult {
  input: EngagementInput;
  rejected: Partial<Record<RejectReason, number>>;
}

const MINUTE_MS = 60_000;

/** Keeps at most `max` timestamps in any sliding minute; the rest are dropped. */
function underRate<T>(items: T[], at: (item: T) => number, max: number): [T[], number] {
  const kept: T[] = [];
  const window: number[] = [];
  let dropped = 0;
  for (const item of items) {
    const t = at(item);
    while (window.length > 0 && t - (window[0] as number) >= MINUTE_MS) window.shift();
    if (window.length >= max) {
      dropped++;
      continue;
    }
    window.push(t);
    kept.push(item);
  }
  return [kept, dropped];
}

export function filterPlausible(input: EngagementInput, now: Date): PlausibilityResult {
  const rejected: PlausibilityResult['rejected'] = {};
  const reject = (reason: RejectReason, n = 1) => {
    if (n > 0) rejected[reason] = (rejected[reason] ?? 0) + n;
  };
  const latest = now.getTime() + CLOCK_SKEW_MS;
  const notFuture = (iso: string | null) => {
    if (iso === null) return true;
    const ok = Date.parse(iso) <= latest;
    if (!ok) reject('future');
    return ok;
  };

  // Reviews: in time order, then duplicates, speed and rate.
  const reviews = input.reviews
    .filter((r) => !r.deleted && notFuture(r.reviewedAt))
    .sort((a, b) => a.reviewedAt.localeCompare(b.reviewedAt));
  const lastByCard = new Map<string, number>();
  const genuine: ReviewEntry[] = [];
  for (const r of reviews) {
    const t = Date.parse(r.reviewedAt);
    const previous = lastByCard.get(r.cardId);
    lastByCard.set(r.cardId, t);
    if (previous !== undefined && t - previous < DUPLICATE_WINDOW_MS) {
      reject('duplicate');
    } else if ((r.durationMs ?? 0) > 0 && (r.durationMs as number) < MIN_ANSWER_MS) {
      reject('too-fast');
    } else {
      genuine.push(r);
    }
  }
  const [paced, fast] = underRate(
    genuine,
    (r) => Date.parse(r.reviewedAt),
    MAX_REVIEWS_PER_MINUTE
  );
  reject('rate', fast);

  const practiceSorted = input.practice
    .filter((p) => !p.deleted && notFuture(p.practisedAt))
    .sort((a, b) => a.practisedAt.localeCompare(b.practisedAt));
  const [practice, practiceFast] = underRate(
    practiceSorted,
    (p) => Date.parse(p.practisedAt),
    MAX_PRACTICE_PER_MINUTE
  );
  reject('rate', practiceFast);

  const exams = input.exams.filter((e) => {
    if (e.deleted || !notFuture(e.finishedAt)) return false;
    const valid =
      e.total >= 0 && e.total <= MAX_EXAM_ITEMS && e.score >= 0 && e.score <= e.total;
    if (!valid) reject('invalid-score');
    return valid;
  });

  return {
    input: {
      ...input,
      reviews: paced,
      practice,
      exams,
      tracks: input.tracks.filter((t) => !t.deleted && notFuture(t.completedAt)),
      checkIns: input.checkIns.filter((c) => !c.deleted && notFuture(c.checkedAt)),
      enrollments: input.enrollments.filter((e) => !e.deleted),
    },
    rejected,
  };
}
