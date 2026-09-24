import { describe, expect, it } from 'vitest';
import { summarize, type EngagementInput, type ReviewEntry } from '@suffa/engagement';
import {
  filterPlausible,
  MAX_REVIEWS_PER_MINUTE,
} from '../src/engagement/plausibility.js';

const NOW = new Date('2026-09-24T12:00:00.000Z');
const at = (msAfter: number) =>
  new Date(Date.parse('2026-09-24T08:00:00.000Z') + msAfter).toISOString();
const review = (cardId: string, t: number, durationMs = 4000): ReviewEntry => ({
  cardId,
  rating: 'good',
  reviewedAt: at(t),
  durationMs,
  scheduledInterval: 1,
});
const input = (overrides: Partial<EngagementInput> = {}): EngagementInput => ({
  reviews: [],
  tracks: [],
  practice: [],
  checkIns: [],
  exams: [],
  enrollments: [],
  lessonSizes: new Map(),
  ...overrides,
});
const xp = (i: EngagementInput) =>
  summarize(i, { timeZone: 'UTC', weeklyGoal: 5, now: NOW }).totalXp;

/** Cheating fixtures (story 5.4): each would earn XP on a tampered device. */
describe('plausibility checks', () => {
  it('keeps an honest session untouched', () => {
    const honest = input({
      reviews: [review('a', 0), review('b', 8000), review('a', 60_000)],
    });
    const result = filterPlausible(honest, NOW);
    expect(result.rejected).toEqual({});
    expect(result.input.reviews).toHaveLength(3);
  });

  it('rejects answers faster than a person can recall, but not unmeasured ones', () => {
    const result = filterPlausible(
      input({
        reviews: [review('a', 0, 120), review('b', 1000, 0), review('c', 2000, 900)],
      }),
      NOW
    );
    expect(result.rejected).toEqual({ 'too-fast': 1 });
    expect(result.input.reviews.map((r) => r.cardId)).toEqual(['b', 'c']);
  });

  it('caps a review flood at a human pace', () => {
    const flood = Array.from({ length: 500 }, (_, i) => review(`c${i}`, i * 100));
    const result = filterPlausible(input({ reviews: flood }), NOW);
    // 500 reviews in 50 s: only one minute's worth counts.
    expect(result.input.reviews).toHaveLength(MAX_REVIEWS_PER_MINUTE);
    expect(result.rejected.rate).toBe(500 - MAX_REVIEWS_PER_MINUTE);
    expect(xp(result.input)).toBeLessThan(xp(input({ reviews: flood })));
  });

  it('drops double submits of the same card', () => {
    const result = filterPlausible(
      input({ reviews: [review('a', 0), review('a', 500), review('a', 1500)] }),
      NOW
    );
    expect(result.rejected).toEqual({ duplicate: 2 });
  });

  it('ignores records from the future and impossible exam scores', () => {
    const future = '2026-09-30T00:00:00.000Z';
    const result = filterPlausible(
      input({
        reviews: [{ ...review('a', 0), reviewedAt: future }],
        tracks: [
          { id: 't', lessonKey: 'l', completedAt: future },
          { id: 'u', lessonKey: 'l', completedAt: null },
        ],
        practice: [{ id: 'p', unit: 1, skill: 'write', practisedAt: future }],
        checkIns: [{ id: '2026-09-30', checkedAt: future }],
        exams: [
          { format: 'x', units: [1], score: 11, total: 10, finishedAt: at(0) },
          { format: 'x', units: [1], score: 5, total: 10_000, finishedAt: at(0) },
          { format: 'x', units: [1], score: 8, total: 10, finishedAt: at(0) },
          { format: 'x', units: [1], score: 8, total: 10, finishedAt: future },
        ],
      }),
      NOW
    );
    expect(result.rejected).toEqual({ future: 5, 'invalid-score': 2 });
    expect(result.input.exams).toHaveLength(1);
    expect(result.input.tracks.map((t) => t.id)).toEqual(['u']);
  });

  it('caps practice floods and leaves deleted records out', () => {
    const practice = Array.from({ length: 100 }, (_, i) => ({
      id: `p${i}`,
      unit: 1,
      skill: 'write',
      practisedAt: at(i * 10),
    }));
    const result = filterPlausible(
      input({
        practice,
        reviews: [{ ...review('gone', 0), deleted: true }],
        enrollments: [{ id: 'e', unit: 1, dueAt: at(0), extended: false, deleted: true }],
      }),
      NOW
    );
    expect(result.input.practice).toHaveLength(30);
    expect(result.input.reviews).toEqual([]);
    expect(result.input.enrollments).toEqual([]);
  });
});
