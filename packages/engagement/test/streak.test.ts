import { describe, expect, it } from 'vitest';
import {
  addDays,
  computeStreak,
  daysLeftInWeek,
  isWeeklyGoal,
  weeklyProgress,
} from '../src/index.js';

/** Days from `start`, one per character: x = active, . = missed. */
function pattern(start: string, marks: string): Set<string> {
  return new Set(
    [...marks].flatMap((mark, i) => (mark === 'x' ? [addDays(start, i)] : []))
  );
}
const START = '2026-09-01';
const dayAt = (i: number) => addDays(START, i);

describe('daily streak with shields', () => {
  it('is zero without activity', () => {
    expect(computeStreak(new Set(), '2026-09-24')).toMatchObject({
      current: 0,
      longest: 0,
      activeToday: false,
    });
  });

  it('counts up to today and keeps standing while today is still open', () => {
    const days = pattern(START, 'xxx');
    expect(computeStreak(days, dayAt(2))).toMatchObject({
      current: 3,
      activeToday: true,
    });
    expect(computeStreak(days, dayAt(3))).toMatchObject({
      current: 3,
      activeToday: false,
    });
    // Days after "today" (another device's clock) do not count.
    expect(computeStreak(pattern(START, 'x.x'), dayAt(0)).current).toBe(1);
  });

  it('breaks after a missed day without a shield', () => {
    const streak = computeStreak(pattern(START, 'xxx.xx'), dayAt(5));
    expect(streak).toMatchObject({ current: 2, longest: 3, shields: 0 });
    expect(streak.reachedOn).toEqual([dayAt(0), dayAt(1), dayAt(2)]);
  });

  it('earns a shield per 7 days (at most 2) and spends it on a missed day', () => {
    const streak = computeStreak(pattern(START, 'xxxxxxx.xxxxxxx'), dayAt(14));
    expect(streak).toMatchObject({ current: 14, shields: 1, shieldedDays: [dayAt(7)] });
    const many = computeStreak(pattern(START, 'x'.repeat(28)), dayAt(27));
    expect(many.shields).toBe(2);
    const twoGaps = computeStreak(pattern(START, `${'x'.repeat(14)}..x`), dayAt(16));
    expect(twoGaps).toMatchObject({ current: 15, shields: 0 });
    const threeGaps = computeStreak(pattern(START, `${'x'.repeat(14)}...x`), dayAt(17));
    expect(threeGaps).toMatchObject({ current: 1, longest: 14 });
  });
});

describe('weekly goal', () => {
  // 2026-09-07 is a Monday.
  const MONDAY = '2026-09-07';

  it('is met with enough active days, whichever days were missed', () => {
    const week = weeklyProgress(pattern(MONDAY, 'x.x.x'), 3, addDays(MONDAY, 4));
    expect(week).toMatchObject({
      weekStart: MONDAY,
      activeDays: 3,
      met: true,
      streak: 1,
      metOn: [addDays(MONDAY, 4)],
    });
  });

  it('counts met weeks in a row; an open week does not break it', () => {
    const days = pattern('2026-08-31', `xxx....${'xxx....'}${'x'}`);
    const open = weeklyProgress(days, 3, '2026-09-14');
    expect(open).toMatchObject({ met: false, activeDays: 1, streak: 2 });
    const broken = weeklyProgress(pattern('2026-08-31', 'xxx'), 3, '2026-09-14');
    expect(broken).toMatchObject({ streak: 0, activeDays: 0 });
    const future = weeklyProgress(pattern('2026-09-14', 'xxxxx'), 5, '2026-09-13');
    expect(future.metOn).toEqual([]);
  });

  it('validates goals and counts the days left', () => {
    expect([3, 5, 7, 4, '5'].map(isWeeklyGoal)).toEqual([true, true, true, false, false]);
    expect(daysLeftInWeek('2026-09-07')).toBe(6);
    expect(daysLeftInWeek('2026-09-13')).toBe(0);
  });
});
