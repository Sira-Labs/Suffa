import { describe, expect, it } from 'vitest';
import { recapIsCurrent } from './WeeklyRecapCard';

const recap = (weekStart: string) => ({
  weekStart,
  xp: 0,
  quests: 0,
  activeDays: 0,
  wordsMatured: 0,
  reviewMinutes: 0,
  bestDay: null,
  badges: [],
  classChallenges: 0,
});

describe('recapIsCurrent', () => {
  it('shows a recap on its Sunday and during the following week only', () => {
    expect(recapIsCurrent(recap('2026-09-21'), '2026-09-27')).toBe(true); // its Sunday
    expect(recapIsCurrent(recap('2026-09-21'), '2026-10-02')).toBe(true); // next week
    expect(recapIsCurrent(recap('2026-09-21'), '2026-10-05')).toBe(false); // two weeks on
  });
});
