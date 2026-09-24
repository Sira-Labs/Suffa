import { describe, expect, it } from 'vitest';
import type { ReviewLog, ReviewRating, SrsCard } from '@/types';
import { createCard, schedule } from '@/services/srs';
import { cardsToRepair, rebuildFromLogs } from './repairCards';

const ID = 'vocab_ar_de:v-bayt';
const fresh = (at = '2026-09-01T08:00:00.000Z') =>
  createCard({ id: ID, contentRef: 'v-bayt', kind: 'vocab_ar_de', now: new Date(at) });

const log = (n: number, rating: ReviewRating, reviewedAt: string): ReviewLog => ({
  id: `log-${n}`,
  cardId: ID,
  contentRef: 'v-bayt',
  kind: 'vocab_ar_de',
  rating,
  durationMs: 1000,
  scheduledInterval: 0,
  reviewedAt,
  updated_at: reviewedAt,
  deleted: false,
});

const LOGS = [
  log(1, 'good', '2026-09-02T09:00:00.000Z'),
  log(2, 'good', '2026-09-03T09:00:00.000Z'),
  log(3, 'again', '2026-09-09T09:00:00.000Z'),
  log(4, 'easy', '2026-09-09T09:05:00.000Z'),
];

/** The card exactly as the reviews produced it on the original device. */
function reviewedIncrementally(): SrsCard {
  return LOGS.reduce(
    (card, l) => schedule(card, l.rating, { now: new Date(l.reviewedAt), fuzz: 0 }),
    fresh()
  );
}

describe('rebuildFromLogs', () => {
  it('restores the reviewed state of a card another device reset', () => {
    // The phone's card was replaced by an untouched card the desktop created later.
    const overwritten = fresh('2026-09-20T07:00:00.000Z');
    const rebuilt = rebuildFromLogs(overwritten, [...LOGS].reverse());
    const expected = reviewedIncrementally();
    expect(rebuilt).toMatchObject({
      reps: expected.reps,
      lapses: expected.lapses,
      interval: expected.interval,
      ease: expected.ease,
      due: expected.due,
      lastReviewed: '2026-09-09T09:05:00.000Z',
    });
  });

  it('leaves a card alone that is as far as its logs', () => {
    expect(rebuildFromLogs(reviewedIncrementally(), LOGS)).toBeNull();
    expect(rebuildFromLogs(fresh(), [])).toBeNull();
  });

  it('keeps a leech mark the logs do not know about', () => {
    const marked = { ...fresh('2026-09-20T07:00:00.000Z'), leech: true };
    expect(rebuildFromLogs(marked, LOGS)?.leech).toBe(true);
  });

  it('ignores deleted logs and logs of other cards', () => {
    const noise = [
      { ...log(9, 'again', '2026-09-30T09:00:00.000Z'), cardId: 'other' },
      { ...log(10, 'again', '2026-09-30T09:00:00.000Z'), deleted: true },
    ];
    expect(rebuildFromLogs(fresh(), [...LOGS, ...noise])?.lastReviewed).toBe(
      '2026-09-09T09:05:00.000Z'
    );
  });
});

describe('cardsToRepair', () => {
  it('returns only the cards whose logs are ahead', () => {
    const upToDate = reviewedIncrementally();
    const behind = { ...fresh(), id: 'vocab_ar_de:v-bab' };
    const behindLogs = LOGS.map((l, i) => ({ ...l, id: `b-${i}`, cardId: behind.id }));
    const repaired = cardsToRepair([upToDate, behind], [...LOGS, ...behindLogs]);
    expect(repaired.map((c) => c.id)).toEqual(['vocab_ar_de:v-bab']);
  });
});
