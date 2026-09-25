import { describe, expect, it } from 'vitest';
import {
  checkInXpEvents,
  listeningXpEvents,
  practiceXpEvents,
  reviewXpEvents,
  stageXpEvents,
  sumXpBetween,
  totalXp,
  unitOnTimeXpEvents,
  XP_RULES,
} from '../src/index.js';
import { exam, practice, review, reviews, track, TZ } from './fixtures.js';

describe('XP rules', () => {
  it('scores ratings and the first success of a card once', () => {
    const events = reviewXpEvents(
      [
        review('a', 'again', '2026-09-23T08:00:00.000Z'),
        review('a', 'good', '2026-09-23T08:01:00.000Z'),
        review('a', 'easy', '2026-09-23T08:02:00.000Z'),
        review('b', 'hard', '2026-09-23T08:03:00.000Z'),
        review('c', 'good', '2026-09-23T08:04:00.000Z', { deleted: true }),
      ],
      TZ
    );
    expect(events.map((e) => [e.kind, e.points])).toEqual([
      ['review', 2],
      ['new-card', 3],
      ['review', 2],
      ['review', 1],
    ]);
  });

  it('caps review XP per local day, not per UTC day', () => {
    // 100 good reviews late on the 23rd (UTC) are all the 24th in Zurich.
    const late = reviews(100, '2026-09-23T22:10:00.000Z');
    const reviewPoints = (tz: string) =>
      reviewXpEvents(late, tz)
        .filter((e) => e.kind === 'review')
        .reduce((s, e) => s + e.points, 0);
    expect(reviewPoints(TZ)).toBe(XP_RULES.reviewDailyCap);
    // In UTC the same reviews span one day too, but a second batch the next day is fresh.
    const nextDay = reviews(10, '2026-09-24T22:30:00.000Z', 'good', 'd');
    const both = reviewXpEvents([...late, ...nextDay], TZ).filter(
      (e) => e.kind === 'review'
    );
    expect(both.reduce((s, e) => s + e.points, 0)).toBe(XP_RULES.reviewDailyCap + 20);
  });

  it('pays heard tracks and a lesson bonus when every track is heard', () => {
    const sizes = new Map([
      ['l1', 2],
      ['l2', 3],
    ]);
    const events = listeningXpEvents(
      [
        track('t1', 'l1', '2026-09-23T08:00:00.000Z'),
        track('t2', 'l1', '2026-09-23T09:00:00.000Z'),
        track('t3', 'l2', '2026-09-23T09:00:00.000Z'),
        track('t4', 'l2', null),
        track('t5', 'l2', '2026-09-23T09:00:00.000Z', true),
        track('t6', 'l9', '2026-09-23T09:00:00.000Z'),
      ],
      sizes
    );
    expect(events.map((e) => e.kind)).toEqual([
      'track',
      'track',
      'track',
      'track',
      'lesson',
    ]);
    expect(events.at(-1)).toMatchObject({ at: '2026-09-23T09:00:00.000Z', ref: 'l1' });
  });

  it('pays practice, check-ins, stages and units finished on time', () => {
    expect(
      practiceXpEvents([
        practice('1:write:a', 'write', '2026-09-23T08:00:00.000Z'),
        practice('1:write:b', 'write', '2026-09-23T08:00:00.000Z', true),
      ])
    ).toHaveLength(1);
    expect(
      checkInXpEvents([
        { id: '2026-09-23', checkedAt: '2026-09-23T08:00:00.000Z' },
        { id: '2026-09-22', checkedAt: '2026-09-22T08:00:00.000Z', deleted: true },
      ])
    ).toEqual([
      { at: '2026-09-23T08:00:00.000Z', points: 10, kind: 'checkin', ref: '2026-09-23' },
    ]);
    const exams = [
      exam([1], 9, 10, '2026-09-09T10:00:00.000Z'),
      exam([2], 9, 10, '2026-09-30T10:00:00.000Z'),
      exam([1, 2, 3, 4, 5, 6, 7, 8], 45, 50, '2026-10-01T10:00:00.000Z', 'stage_test'),
    ];
    const enrollment = (unit: number, deleted = false) => ({
      id: `b1-u${unit}`,
      unit,
      dueAt: '2026-09-10T21:59:59.999Z',
      extended: false,
      deleted,
    });
    expect(
      unitOnTimeXpEvents([enrollment(1), enrollment(2), enrollment(3, true)], exams).map(
        (e) => e.ref
      )
    ).toEqual(['b1-u1']);
    expect(stageXpEvents(exams)).toEqual([
      { at: '2026-10-01T10:00:00.000Z', points: 250, kind: 'stage', ref: 'stage-1' },
    ]);
  });

  it('sums XP by local day range', () => {
    const events = [
      { at: '2026-09-20T23:30:00.000Z', points: 5, kind: 'track' as const, ref: 'a' },
      { at: '2026-09-21T10:00:00.000Z', points: 7, kind: 'track' as const, ref: 'b' },
      { at: '2026-09-28T10:00:00.000Z', points: 11, kind: 'track' as const, ref: 'c' },
    ];
    // 23:30 UTC on the 20th is already Monday the 21st in Zurich.
    expect(sumXpBetween(events, '2026-09-21', '2026-09-27', TZ)).toBe(12);
    expect(sumXpBetween(events, '2026-09-21', '2026-09-27', 'UTC')).toBe(7);
    expect(totalXp(events)).toBe(23);
  });
});
