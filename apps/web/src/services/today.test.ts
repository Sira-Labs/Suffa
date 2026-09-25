import { describe, expect, it } from 'vitest';
import type { ReviewLog, Vokabel } from '@/types';
import { reviewsToday, wordOfTheDay } from './today';

describe('reviewsToday', () => {
  const log = (cardId: string, reviewedAt: string): ReviewLog =>
    ({ id: `${cardId}-${reviewedAt}`, cardId, reviewedAt, deleted: false }) as ReviewLog;
  const now = new Date(2026, 8, 23, 18, 0);

  it('counts reviews today and cards seen for the first time today', () => {
    const logs = [
      log('a', new Date(2026, 8, 20, 9).toISOString()),
      log('a', new Date(2026, 8, 23, 9).toISOString()),
      log('b', new Date(2026, 8, 23, 9).toISOString()),
      log('b', new Date(2026, 8, 23, 10).toISOString()),
    ];
    expect(reviewsToday(logs, now)).toEqual({ reviewed: 3, newLearned: 1 });
  });
});

describe('wordOfTheDay', () => {
  const words = ['x', 'y', 'z'].map((id) => ({ id }) as Vokabel);

  it('is stable for a day and independent of input order', () => {
    const day = new Date(2026, 8, 23, 8);
    const later = new Date(2026, 8, 23, 22);
    expect(wordOfTheDay(words, day)).toBe(wordOfTheDay([...words].reverse(), later));
  });

  it('returns null without words', () => {
    expect(wordOfTheDay([], new Date())).toBeNull();
  });
});
