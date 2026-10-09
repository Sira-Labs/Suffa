import { describe, expect, it } from 'vitest';
import type { ReviewLog, ReviewRating, SrsCard } from '@/types';
import { rebuildFromLogs } from '@/services/sync/repairCards';
import {
  createCard,
  DESIRED_RETENTION,
  difficultyFromEase,
  easeFromDifficulty,
  intervalFor,
  isDue,
  LEECH_LAPSE_THRESHOLD,
  memoryState,
  previewIntervals,
  retrievability,
  schedule,
  scheduleFsrs,
} from '@/services/srs';

const DAY = 24 * 60 * 60 * 1000;
const T0 = new Date('2026-10-01T08:00:00.000Z');
const at = (days: number) => new Date(T0.getTime() + days * DAY);
const fresh = (id = 'c1') =>
  createCard({ id, contentRef: `w:${id}`, kind: 'vocab_ar_de', now: T0 });

/** A small deterministic pseudo-random generator (the tests must not flake). */
function lcg(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1_103_515_245 + 12_345) % 2 ** 31;
    return s / 2 ** 31;
  };
}

describe('FSRS-5 memory model', () => {
  it('recalls 90 % after one stability, and schedules the interval there', () => {
    expect(retrievability(10, 10)).toBeCloseTo(DESIRED_RETENTION, 6);
    expect(intervalFor(10)).toBe(10);
    expect(intervalFor(0.2)).toBe(1);
    expect(intervalFor(1e9)).toBe(36_500);
  });

  it('starts a new card from the weights of its first rating', () => {
    const good = scheduleFsrs(fresh(), 'good', T0);
    expect(good).toMatchObject({ stability: 3.173, interval: 3, reps: 1, lapses: 0 });
    expect(scheduleFsrs(fresh(), 'easy', T0).interval).toBe(16);
    const again = scheduleFsrs(fresh(), 'again', T0);
    expect(again).toMatchObject({
      interval: 0,
      reps: 0,
      lapses: 1,
      due: T0.toISOString(),
    });
    expect(again.difficulty!).toBeGreaterThan(good.difficulty!);
  });

  it('grows stability on recall and shrinks it on a lapse', () => {
    const first = scheduleFsrs(fresh(), 'good', T0);
    const second = scheduleFsrs(first, 'good', at(3));
    expect(second.stability!).toBeGreaterThan(first.stability!);
    expect(second.interval).toBeGreaterThan(first.interval);
    const hard = scheduleFsrs(first, 'hard', at(3));
    const easy = scheduleFsrs(first, 'easy', at(3));
    expect(hard.interval).toBeLessThan(second.interval);
    expect(easy.interval).toBeGreaterThan(second.interval);
    const lapse = scheduleFsrs(second, 'again', at(3 + second.interval));
    expect(lapse.stability!).toBeLessThan(second.stability!);
    expect(lapse).toMatchObject({ interval: 0, reps: 0, lapses: 1 });
  });

  it('treats a second review on the same day as short-term', () => {
    const first = scheduleFsrs(fresh(), 'again', T0);
    const sameDay = scheduleFsrs(first, 'good', new Date(T0.getTime() + 10 * 60 * 1000));
    expect(sameDay.stability!).toBeGreaterThan(first.stability!);
    expect(sameDay.interval).toBeGreaterThanOrEqual(1);
  });

  it('maps SM-2 ease and FSRS difficulty onto each other', () => {
    expect(difficultyFromEase(2.5)).toBe(5);
    expect(difficultyFromEase(1.3)).toBe(9);
    expect(difficultyFromEase(5)).toBe(1);
    expect(easeFromDifficulty(5)).toBe(2.5);
    expect(easeFromDifficulty(10)).toBe(1.3);
    for (const ease of [1.6, 2.2, 2.5, 2.8]) {
      expect(easeFromDifficulty(difficultyFromEase(ease))).toBeCloseTo(ease, 4);
    }
  });
});

describe('switching from SM-2 (story 15.6)', () => {
  it('derives the memory state of an SM-2 card from its interval and ease', () => {
    expect(memoryState(fresh())).toBeNull();
    const sm2: SrsCard = {
      ...fresh(),
      interval: 12,
      ease: 2.2,
      reps: 4,
      lastReviewed: at(-12).toISOString(),
      due: at(0).toISOString(),
    };
    expect(memoryState(sm2)).toEqual({ stability: 12, difficulty: 6 });
    // Recall at the due date is the 90 % SM-2 aimed for; a good answer pushes it further out.
    const next = scheduleFsrs(sm2, 'good', at(0));
    expect(next.interval).toBeGreaterThan(12);
    expect(next.reps).toBe(5);
  });

  /** A deck of 1200 cards studied with SM-2 for 90 days, with a realistic mix of ratings. */
  function sm2Deck(): SrsCard[] {
    const random = lcg(42);
    const ratings: ReviewRating[] = ['again', 'hard', 'good', 'good', 'good', 'easy'];
    let cards = Array.from({ length: 1200 }, (_, i) =>
      createCard({ id: `c${i}`, contentRef: `w${i}`, kind: 'vocab_ar_de', now: at(-90) })
    );
    for (let day = -90; day < 0; day++) {
      const now = at(day);
      // 15 new cards a day, plus everything due.
      let newToday = 0;
      cards = cards.map((card) => {
        if (!isDue(card, now)) return card;
        if (card.reps === 0 && card.lastReviewed === null && newToday++ >= 15)
          return card;
        const rating = ratings[Math.floor(random() * ratings.length)]!;
        return schedule(card, rating, { now, fuzz: 0 });
      });
    }
    return cards;
  }

  const dueOn = (cards: SrsCard[], day: number) =>
    cards.filter((c) => c.lastReviewed !== null && isDue(c, at(day))).length;

  it('keeps the same cards due on the first day after switching', () => {
    const deck = sm2Deck();
    // Switching changes no due date: on the day of the switch exactly the same cards are due
    // (the acceptance criterion asks for ±10 %).
    const today = dueOn(deck, 0);
    expect(today).toBeGreaterThan(50);
    const switched = deck.map((card) => ({ ...card, ...memoryState(card) }));
    expect(dueOn(switched, 0)).toBe(today);
  });

  it('then plans young cards further out, without a sudden pile or gap', () => {
    const deck = sm2Deck();
    // Review the switch day's cards once with each algorithm (same ratings) and compare the
    // load of the following days. FSRS spreads young cards differently from SM-2's fixed 1 and
    // 6 days, so single days differ; the week's total stays close. The bounds catch a broken
    // model, not a tuning difference.
    const random = lcg(7);
    const ratings: ReviewRating[] = ['hard', 'good', 'good', 'good', 'easy'];
    const plan = deck.map(() => ratings[Math.floor(random() * ratings.length)]!);
    const reviewWith = (algorithm: 'sm2' | 'fsrs') =>
      deck.map((card, i) =>
        card.lastReviewed !== null && isDue(card, at(0))
          ? schedule(card, plan[i]!, { now: at(0), fuzz: 0, algorithm })
          : card
      );
    const sm2 = reviewWith('sm2');
    const fsrs = reviewWith('fsrs');
    const days = [1, 2, 3, 4, 5, 6, 7];
    const load = (cards: SrsCard[]) => days.reduce((sum, d) => sum + dueOn(cards, d), 0);
    for (const day of days) {
      const a = dueOn(sm2, day);
      const b = dueOn(fsrs, day);
      expect(Math.abs(b - a) / a, `day ${day}: SM-2 ${a}, FSRS ${b}`).toBeLessThanOrEqual(
        0.2
      );
    }
    expect(Math.abs(load(fsrs) - load(sm2)) / load(sm2)).toBeLessThanOrEqual(0.1);
  });

  it('switching back to SM-2 loses nothing', () => {
    let card = fresh();
    card = schedule(card, 'good', { now: T0, algorithm: 'fsrs' });
    card = schedule(card, 'good', { now: at(card.interval), algorithm: 'fsrs' });
    const fsrsState = { stability: card.stability, difficulty: card.difficulty };
    // SM-2 continues from the fields FSRS kept up to date …
    const back = schedule(card, 'good', { now: at(30), algorithm: 'sm2' });
    expect(back.reps).toBe(3);
    expect(back.interval).toBe(Math.round(card.interval * card.ease));
    // … and the FSRS state stays on the card for a later switch.
    expect(back).toMatchObject(fsrsState);
  });

  it('counts lapses and marks leeches as SM-2 does', () => {
    let card = fresh();
    for (let i = 0; i < LEECH_LAPSE_THRESHOLD; i++) {
      card = schedule(card, 'again', { now: at(i), algorithm: 'fsrs' });
    }
    expect(card.lapses).toBe(LEECH_LAPSE_THRESHOLD);
    expect(card.leech).toBe(true);
  });

  it('spreads intervals with fuzz and previews per algorithm', () => {
    let card = fresh();
    card = schedule(card, 'good', { now: T0, algorithm: 'fsrs' });
    card = schedule(card, 'good', { now: at(3), algorithm: 'fsrs' });
    const plain = schedule(card, 'good', { now: at(15), algorithm: 'fsrs', fuzz: 0 });
    const fuzzed = Array.from({ length: 20 }, () =>
      schedule(card, 'good', { now: at(15), algorithm: 'fsrs', fuzz: 0.1 })
    );
    for (const f of fuzzed) {
      expect(Math.abs(f.interval - plain.interval)).toBeLessThanOrEqual(
        Math.ceil(plain.interval * 0.1)
      );
      expect(f.due).toBe(
        new Date(Date.UTC(2026, 9, 16) + f.interval * DAY).toISOString()
      );
    }
    expect(previewIntervals(card, at(15), 'fsrs').good).toBe(plain.interval);
    expect(previewIntervals(card, at(15)).good).not.toBe(plain.interval);
  });

  it('rebuilds a card from its review logs to the same FSRS state (sync)', () => {
    const steps: [ReviewRating, number][] = [
      ['good', 0],
      ['again', 3],
      ['good', 3],
      ['good', 5],
    ];
    let live = fresh();
    const logs: ReviewLog[] = steps.map(([rating, day], i) => {
      live = schedule(live, rating, { now: at(day), fuzz: 0, algorithm: 'fsrs' });
      return {
        id: `l${i}`,
        cardId: live.id,
        contentRef: live.contentRef,
        kind: live.kind,
        rating,
        durationMs: 1000,
        scheduledInterval: live.interval,
        reviewedAt: at(day).toISOString(),
        updated_at: at(day).toISOString(),
        deleted: false,
      };
    });
    const rebuilt = rebuildFromLogs(fresh(), logs, 'fsrs');
    expect(rebuilt).toMatchObject({
      stability: live.stability,
      difficulty: live.difficulty,
      interval: live.interval,
      due: live.due,
      lapses: 1,
    });
  });
});
