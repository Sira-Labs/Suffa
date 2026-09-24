import { describe, expect, it } from 'vitest';
import type { DailyCheckIn, MediaProgress, ReviewLog, ReviewRating } from '@/types';
import {
  checkInXpEvents,
  listeningXpEvents,
  reviewXpEvents,
  startOfWeek,
  sumXp,
  XP_RULES,
} from './xp';

const log = (cardId: string, rating: ReviewRating, reviewedAt: string): ReviewLog =>
  ({
    id: `${cardId}-${reviewedAt}`,
    cardId,
    rating,
    reviewedAt,
    deleted: false,
  }) as ReviewLog;

const heard = (
  id: string,
  lessonKey: string,
  completedAt: string | null
): MediaProgress => ({
  id,
  source: 'publisher-audio',
  ref: `https://example/${id}.mp3`,
  lessonKey,
  durationSec: 60,
  listenedSec: completedAt ? 60 : 10,
  completedAt,
  updated_at: completedAt ?? '2026-09-23T00:00:00.000Z',
  deleted: false,
});

describe('reviewXpEvents', () => {
  it('scores ratings and the first successful review of a card once', () => {
    const events = reviewXpEvents([
      log('a', 'again', '2026-09-23T08:00:00.000Z'),
      log('a', 'good', '2026-09-23T08:01:00.000Z'),
      log('a', 'easy', '2026-09-23T08:02:00.000Z'),
      log('b', 'hard', '2026-09-23T08:03:00.000Z'),
    ]);
    const total = events.reduce((s, e) => s + e.points, 0);
    // again 0, good 2 + learned 3, easy 2, hard 1
    expect(total).toBe(8);
    expect(events.filter((e) => e.kind === 'new-card')).toHaveLength(1);
  });

  it('soft-caps review XP per day but keeps new-word XP', () => {
    const logs = Array.from({ length: 100 }, (_, i) =>
      log(
        `c${i}`,
        'good',
        `2026-09-23T09:${String(i % 60).padStart(2, '0')}:${String(Math.floor(i / 60)).padStart(2, '0')}.000Z`
      )
    );
    const events = reviewXpEvents(logs);
    const reviewXp = events
      .filter((e) => e.kind === 'review')
      .reduce((s, e) => s + e.points, 0);
    expect(reviewXp).toBe(XP_RULES.reviewDailyCap);
    expect(events.filter((e) => e.kind === 'new-card')).toHaveLength(100);
  });
});

describe('listeningXpEvents', () => {
  const sizes = new Map([['b1/u1/l1', 2]]);

  it('gives XP per heard track and a lesson bonus when every track is heard', () => {
    const events = listeningXpEvents(
      [
        heard('t1', 'b1/u1/l1', '2026-09-23T10:00:00.000Z'),
        heard('t2', 'b1/u1/l1', '2026-09-23T10:05:00.000Z'),
      ],
      sizes
    );
    expect(events.map((e) => [e.kind, e.points])).toEqual([
      ['track', 5],
      ['track', 5],
      ['lesson', 15],
    ]);
    expect(events.at(-1)!.at).toBe('2026-09-23T10:05:00.000Z');
  });

  it('ignores unfinished tracks and incomplete lessons', () => {
    const events = listeningXpEvents(
      [
        heard('t1', 'b1/u1/l1', '2026-09-23T10:00:00.000Z'),
        heard('t2', 'b1/u1/l1', null),
      ],
      sizes
    );
    expect(events.map((e) => e.kind)).toEqual(['track']);
  });
});

describe('sumXp and startOfWeek', () => {
  it('counts only this week, starting Monday', () => {
    const now = new Date(2026, 8, 23, 12); // Wednesday
    const monday = startOfWeek(now);
    expect(monday.getDay()).toBe(1);
    expect(monday.getDate()).toBe(21);
    const events = [
      { at: new Date(2026, 8, 20, 12).toISOString(), points: 7, kind: 'track', ref: 'x' },
      { at: new Date(2026, 8, 22, 12).toISOString(), points: 5, kind: 'track', ref: 'y' },
    ] as const;
    expect(sumXp([...events], monday, now)).toBe(5);
  });
});

describe('check-in XP', () => {
  it('gives one event per checked-in day, none for deleted records', () => {
    const day = (id: string, deleted = false) =>
      ({ id, wordId: 'w', checkedAt: `${id}T08:00:00.000Z`, deleted }) as DailyCheckIn;
    const events = checkInXpEvents([
      day('2026-09-22'),
      day('2026-09-23'),
      day('x', true),
    ]);
    expect(events.map((e) => e.ref)).toEqual(['2026-09-22', '2026-09-23']);
    expect(events.every((e) => e.points === XP_RULES.dailyCheckIn)).toBe(true);
  });
});
