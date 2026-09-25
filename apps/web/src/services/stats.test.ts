import { describe, expect, it } from 'vitest';
import type { ReviewLog, SrsCard } from '@/types';
import {
  daysSinceLastReview,
  forgettingCurve,
  isStreakBroken,
  unitMastery,
  weakCards,
} from './stats';

const log = (reviewedAt: string) => ({ reviewedAt, deleted: false }) as ReviewLog;
const now = new Date(2026, 8, 23, 10, 0);

describe('forgetting reminder', () => {
  it('counts calendar days since the last review', () => {
    expect(daysSinceLastReview([], now)).toBeNull();
    expect(daysSinceLastReview([log(new Date(2026, 8, 23, 8).toISOString())], now)).toBe(
      0
    );
    expect(
      daysSinceLastReview(
        [
          log(new Date(2026, 8, 19, 22).toISOString()),
          log(new Date(2026, 8, 20, 9).toISOString()),
        ],
        now
      )
    ).toBe(3);
  });

  it('reminds only once the streak is broken', () => {
    expect(isStreakBroken([], now)).toBe(false);
    expect(isStreakBroken([log(new Date(2026, 8, 22, 21).toISOString())], now)).toBe(
      false
    );
    expect(isStreakBroken([log(new Date(2026, 8, 21, 21).toISOString())], now)).toBe(
      true
    );
  });

  it('models retention falling day by day', () => {
    const curve = forgettingCurve([], 7);
    expect(curve[0]!.retention).toBe(1);
    expect(curve[1]!.retention).toBeLessThan(0.4);
    expect(curve.at(-1)!.retention).toBeLessThan(curve[1]!.retention);
  });
});

describe('weakCards', () => {
  const card = (id: string, leech = false) =>
    ({ id, contentRef: id, deleted: false, leech }) as SrsCard;
  const log = (cardId: string, rating: ReviewLog['rating'], reviewedAt: string) =>
    ({ cardId, rating, reviewedAt }) as ReviewLog;

  it('lists cards last rated "Schwer" or "Nochmal" and leeches, newest first', () => {
    const cards = [card('a'), card('b'), card('c'), card('d', true)];
    const logs = [
      log('a', 'hard', '2026-09-24T08:00:00Z'),
      log('b', 'again', '2026-09-24T09:00:00Z'),
      log('c', 'hard', '2026-09-23T08:00:00Z'),
      log('c', 'good', '2026-09-24T10:00:00Z'),
    ];
    expect(weakCards(cards, logs).map((c) => c.id)).toEqual(['b', 'a', 'd']);
  });
});

describe('unitMastery', () => {
  const card = (contentRef: string, interval: number, deleted = false) =>
    ({ id: `${contentRef}-${interval}`, contentRef, interval, deleted }) as SrsCard;

  it('is the share of a unit’s words with a mature card', () => {
    const words = [
      { id: 'a', einheit: 1 },
      { id: 'b', einheit: 1 },
      { id: 'c', einheit: 1 },
      { id: 'd', einheit: 2 },
    ];
    const mastery = unitMastery(
      [card('a', 30), card('a', 25), card('b', 5), card('c', 40, true), card('d', 21)],
      words
    );
    expect(mastery.get(1)).toBe(33);
    expect(mastery.get(2)).toBe(100);
    expect(mastery.get(3)).toBeUndefined();
  });
});
