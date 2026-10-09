/**
 * FSRS-5 scheduling (story 15.6, amends ADR-0001): a memory model with a stability S (days
 * until recall drops to 90 %) and a difficulty D (1–10) per card, updated after each review
 * with the published default weights. Same 4-level rating and day resolution as SM-2.
 *
 * Switching is per learner and lossless:
 * - A card reviewed with SM-2 so far gets its FSRS state from its SM-2 state on its first
 *   FSRS review (S from the interval, D from the ease); due dates are never touched by the
 *   switch, so the same cards are due on the first day.
 * - FSRS keeps the SM-2 fields (interval, reps, lapses, ease derived from D) up to date, so
 *   switching back to SM-2 continues from where FSRS left off.
 */
import type { ReviewRating, SrsCard } from '@/types';

/** FSRS-5 default weights (open-spaced-repetition, 2024). */
export const FSRS_WEIGHTS = [
  0.40255, 1.18385, 3.173, 15.69105, 7.1949, 0.5345, 1.4604, 0.0046, 1.54575, 0.1192,
  1.01925, 1.9395, 0.11, 0.29605, 2.2698, 0.2315, 2.9898, 0.51655, 0.6621,
] as const;

/** Recall probability the intervals aim for. */
export const DESIRED_RETENTION = 0.9;

const DECAY = -0.5;
const FACTOR = 19 / 81;
const MAX_INTERVAL = 36_500;
const DAY_MS = 24 * 60 * 60 * 1000;
const w = FSRS_WEIGHTS;

const GRADE: Record<ReviewRating, 1 | 2 | 3 | 4> = {
  again: 1,
  hard: 2,
  good: 3,
  easy: 4,
};

const clampDifficulty = (d: number) => Math.min(10, Math.max(1, d));
const round4 = (x: number) => Number(x.toFixed(4));

/** Probability of recall `days` after the last review. */
export function retrievability(days: number, stability: number): number {
  return Math.pow(1 + (FACTOR * days) / stability, DECAY);
}

/** Days until recall drops to the desired retention. */
export function intervalFor(stability: number): number {
  const days = (stability / FACTOR) * (Math.pow(DESIRED_RETENTION, 1 / DECAY) - 1);
  return Math.min(MAX_INTERVAL, Math.max(1, Math.round(days)));
}

function initialDifficulty(grade: number): number {
  return clampDifficulty(w[4] - Math.exp(w[5] * (grade - 1)) + 1);
}

function nextDifficulty(d: number, grade: number): number {
  const delta = -w[6] * (grade - 3);
  const damped = d + (delta * (10 - d)) / 9;
  // Mean reversion towards the difficulty of an "easy" first answer.
  return clampDifficulty(w[7] * initialDifficulty(4) + (1 - w[7]) * damped);
}

function recallStability(d: number, s: number, r: number, grade: number): number {
  const hard = grade === 2 ? w[15] : 1;
  const easy = grade === 4 ? w[16] : 1;
  return (
    s *
    (Math.exp(w[8]) *
      (11 - d) *
      Math.pow(s, -w[9]) *
      (Math.exp(w[10] * (1 - r)) - 1) *
      hard *
      easy +
      1)
  );
}

function forgetStability(d: number, s: number, r: number): number {
  const next =
    w[11] *
    Math.pow(d, -w[12]) *
    (Math.pow(s + 1, w[13]) - 1) *
    Math.exp(w[14] * (1 - r));
  return Math.min(next, s);
}

/** A second review on the same day. */
function sameDayStability(s: number, grade: number): number {
  return s * Math.exp(w[17] * (grade - 3 + w[18]));
}

/**
 * SM-2 ease and FSRS difficulty map onto each other linearly: ease 2.5 ↔ D 5, ease 1.3 ↔ D 9,
 * one step of 0.3 ease per point of difficulty.
 */
export function difficultyFromEase(ease: number): number {
  return clampDifficulty(round4(5 + (2.5 - ease) / 0.3));
}

export function easeFromDifficulty(d: number): number {
  return Math.max(1.3, round4(2.5 - (d - 5) * 0.3));
}

/** Whole UTC days between two instants (never negative). */
function daysBetween(from: Date, to: Date): number {
  const day = (d: Date) => Math.floor(d.getTime() / DAY_MS);
  return Math.max(0, day(to) - day(from));
}

/**
 * The FSRS memory state of a card: stored, or derived from its SM-2 state (the SM-2 interval
 * was the gap after which it expected recall, which FSRS calls the stability at 90 %).
 * Null for a card never reviewed.
 */
export function memoryState(
  card: SrsCard
): { stability: number; difficulty: number } | null {
  if (card.stability != null && card.difficulty != null) {
    return { stability: card.stability, difficulty: card.difficulty };
  }
  if (card.lastReviewed === null) return null;
  return {
    stability: Math.max(card.interval, w[0]),
    difficulty: difficultyFromEase(card.ease),
  };
}

/** The card after a rating, scheduled with FSRS-5. Pure and deterministic. */
export function scheduleFsrs(card: SrsCard, rating: ReviewRating, now: Date): SrsCard {
  const grade = GRADE[rating];
  const state = memoryState(card);
  let stability: number;
  let difficulty: number;
  if (!state) {
    stability = w[grade - 1]!;
    difficulty = initialDifficulty(grade);
  } else {
    const elapsed = daysBetween(new Date(card.lastReviewed!), now);
    difficulty = nextDifficulty(state.difficulty, grade);
    if (elapsed === 0) {
      stability = sameDayStability(state.stability, grade);
    } else {
      const r = retrievability(elapsed, state.stability);
      stability =
        grade === 1
          ? forgetStability(state.difficulty, state.stability, r)
          : recallStability(state.difficulty, state.stability, r, grade);
    }
  }
  stability = round4(Math.max(stability, 0.01));
  difficulty = round4(difficulty);

  const lapse = rating === 'again';
  // A lapse stays due today (as with SM-2); everything else waits for its interval.
  const interval = lapse ? 0 : intervalFor(stability);
  const iso = now.toISOString();
  const due = new Date(now.getTime() + interval * DAY_MS);
  return {
    ...card,
    stability,
    difficulty,
    ease: easeFromDifficulty(difficulty),
    reps: lapse ? 0 : card.reps + 1,
    lapses: lapse ? card.lapses + 1 : card.lapses,
    interval,
    due: interval === 0 ? iso : startOfDayIso(due),
    lastReviewed: iso,
    updated_at: iso,
  };
}

function startOfDayIso(date: Date): string {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  ).toISOString();
}
