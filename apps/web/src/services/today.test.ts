import { describe, expect, it } from 'vitest';
import type { ReviewLog, Vokabel } from '@/types';
import { buildTodayPlan, reviewsToday, wordOfTheDay } from './today';

const base = {
  dueCount: 0,
  newCount: 0,
  leechCount: 0,
  dailyGoal: 20,
  reviewedToday: 0,
  newLearnedToday: 0,
};

describe('buildTodayPlan', () => {
  it('starts with the due reviews and mentions difficult words', () => {
    const { steps } = buildTodayPlan({
      ...base,
      dueCount: 24,
      newCount: 40,
      leechCount: 3,
    });
    expect(steps.map((s) => [s.id, s.state])).toEqual([
      ['review', 'current'],
      ['new', 'upcoming'],
      ['listen', 'upcoming'],
    ]);
    expect(steps[0]).toMatchObject({ label: '24 Karten wiederholen', to: '/review' });
    expect(steps[0]!.detail).toBe('davon 3 schwierige Wörter');
    expect(steps[1]!.label).toBe('5 neue Wörter');
  });

  it('moves on to new words once nothing is due', () => {
    const { steps } = buildTodayPlan({ ...base, newCount: 2, reviewedToday: 12 });
    expect(steps.map((s) => s.state)).toEqual(['done', 'current', 'upcoming']);
    expect(steps[0]!.detail).toBe('Für heute erledigt');
    expect(steps[1]!.label).toBe('2 neue Wörter');
  });

  it('suggests listening when cards are done', () => {
    const { steps } = buildTodayPlan({
      ...base,
      newCount: 30,
      newLearnedToday: 5,
      reviewedToday: 20,
    });
    expect(steps.map((s) => s.state)).toEqual(['done', 'done', 'current']);
    expect(steps[2]!.to).toBe('/library');
  });

  it('uses singular forms and estimates minutes', () => {
    const { steps, minutes } = buildTodayPlan({
      ...base,
      dueCount: 1,
      leechCount: 1,
      newCount: 1,
    });
    expect(steps[0]!.label).toBe('1 Karte wiederholen');
    expect(steps[0]!.detail).toBe('davon 1 schwieriges Wort');
    expect(steps[1]!.label).toBe('1 neues Wort');
    expect(minutes).toBeGreaterThanOrEqual(1);
  });
});

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

describe('buildTodayPlan: listening', () => {
  it('ticks off "Dialog hören" once a track was heard today', () => {
    const { steps } = buildTodayPlan({
      dueCount: 0,
      newCount: 0,
      leechCount: 0,
      dailyGoal: 20,
      reviewedToday: 3,
      newLearnedToday: 0,
      heardToday: 2,
    });
    expect(steps[2]).toMatchObject({ state: 'done', detail: '2 Aufnahmen gehört' });
  });
});
