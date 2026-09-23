/**
 * SRS scheduling engine (SM-2 style with FSRS-like adjustments).
 *
 * Design decisions (see ADR-0001):
 *  - SM-2 as the basis: robust, computable offline, well understood.
 *  - 4-level rating (again/hard/good/easy) instead of 0–5, closer to Anki/FSRS.
 *  - "again" is a lapse: interval reset + ease penalty; the card may become a leech.
 *  - First two successful reps: fixed learning intervals (1 day, then 6 days).
 *  - All date math in UTC; `due` is an ISO date (day resolution).
 */
import type { ReviewRating, SrsCard } from '@/types';

export const MIN_EASE = 1.3;
export const DEFAULT_EASE = 2.5;
export const LEECH_LAPSE_THRESHOLD = 4;

const DAY_MS = 24 * 60 * 60 * 1000;

export interface NewCardInput {
  id: string;
  contentRef: string;
  kind: SrsCard['kind'];
  now?: Date;
}

/** Creates a fresh card that is due immediately. */
export function createCard(input: NewCardInput): SrsCard {
  const now = input.now ?? new Date();
  const iso = now.toISOString();
  return {
    id: input.id,
    contentRef: input.contentRef,
    kind: input.kind,
    interval: 0,
    ease: DEFAULT_EASE,
    reps: 0,
    lapses: 0,
    due: iso,
    lastReviewed: null,
    leech: false,
    updated_at: iso,
    deleted: false,
  };
}

/** Ease adjustment per rating (SM-2 inspired). */
function nextEase(ease: number, rating: ReviewRating): number {
  let delta = 0;
  switch (rating) {
    case 'again':
      delta = -0.2;
      break;
    case 'hard':
      delta = -0.15;
      break;
    case 'good':
      delta = 0;
      break;
    case 'easy':
      delta = 0.15;
      break;
  }
  return Math.max(MIN_EASE, Number((ease + delta).toFixed(4)));
}

export interface ScheduleOptions {
  now?: Date;
  /** Random spread (±%) against cards piling up on the same day. 0 = deterministic. */
  fuzz?: number;
}

/**
 * Computes the new card state after a rating.
 * Pure function (no side effects), hence easy to test.
 */
export function schedule(
  card: SrsCard,
  rating: ReviewRating,
  options: ScheduleOptions = {}
): SrsCard {
  const now = options.now ?? new Date();
  const fuzz = options.fuzz ?? 0;
  const ease = nextEase(card.ease, rating);

  let interval: number;
  let reps = card.reps;
  let lapses = card.lapses;

  if (rating === 'again') {
    // Lapse: back to the learning phase.
    reps = 0;
    lapses += 1;
    interval = 0; // due again today (learning step)
  } else if (card.reps === 0) {
    reps = 1;
    interval = rating === 'easy' ? 4 : 1;
  } else if (card.reps === 1) {
    reps = 2;
    interval = rating === 'easy' ? 7 : 6;
  } else {
    reps = card.reps + 1;
    const hardFactor = 1.2;
    const easyBonus = 1.3;
    const base = card.interval > 0 ? card.interval : 1;
    if (rating === 'hard') {
      interval = Math.round(base * hardFactor);
    } else if (rating === 'easy') {
      interval = Math.round(base * ease * easyBonus);
    } else {
      interval = Math.round(base * ease);
    }
  }

  if (fuzz > 0 && interval >= 2) {
    const spread = interval * fuzz;
    const jitter = (Math.random() * 2 - 1) * spread;
    interval = Math.max(1, Math.round(interval + jitter));
  }

  const due = new Date(now.getTime() + interval * DAY_MS);
  const iso = now.toISOString();
  const leech = lapses >= LEECH_LAPSE_THRESHOLD;

  return {
    ...card,
    ease,
    reps,
    lapses,
    interval,
    due: interval === 0 ? iso : startOfDayIso(due),
    lastReviewed: iso,
    leech: card.leech || leech,
    updated_at: iso,
  };
}

/** Normalises a date to start of day (UTC) as an ISO string. */
export function startOfDayIso(date: Date): string {
  const d = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  );
  return d.toISOString();
}

/** Is the card due at the given date? */
export function isDue(card: SrsCard, now: Date = new Date()): boolean {
  if (card.deleted) return false;
  return new Date(card.due).getTime() <= now.getTime();
}

/**
 * Preview of the next intervals for the 4 buttons (UI hint "in X days").
 */
export function previewIntervals(
  card: SrsCard,
  now: Date = new Date()
): Record<ReviewRating, number> {
  const ratings: ReviewRating[] = ['again', 'hard', 'good', 'easy'];
  const result = {} as Record<ReviewRating, number>;
  for (const r of ratings) {
    result[r] = schedule(card, r, { now, fuzz: 0 }).interval;
  }
  return result;
}
