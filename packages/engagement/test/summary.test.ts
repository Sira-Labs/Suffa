import { describe, expect, it } from 'vitest';
import { lastDays, summarize } from '../src/index.js';
import { empty, practice, reviews, track, TZ } from './fixtures.js';

describe('summarize', () => {
  it('works for a new learner', () => {
    const summary = summarize(empty(), {
      timeZone: TZ,
      weeklyGoal: 5,
      now: new Date('2026-09-24T10:00:00.000Z'),
    });
    expect(summary).toMatchObject({
      today: '2026-09-24',
      totalXp: 0,
      level: { level: 1 },
      streak: { current: 0 },
      achievements: [],
    });
    expect(summary.quests.quests).toHaveLength(3);
  });

  it('adds quest XP, streak and weekly progress from the same records', () => {
    const input = empty();
    const day = (d: number, h = 8) =>
      new Date(Date.UTC(2026, 8, 21 + d, h)).toISOString();
    input.reviews = [0, 1, 2].flatMap((d) => reviews(25, day(d), 'good', `d${d}-`));
    input.tracks = [0, 1, 2].map((d) => track(`t${d}`, 'l', day(d, 9)));
    input.practice = [0, 1, 2].flatMap((d) =>
      ['write', 'read', 'cloze', 'write', 'write', 'cloze', 'cloze'].map((skill, i) =>
        practice(`${d}:${i}`, skill, day(d, 10))
      )
    );
    input.checkIns = [{ id: '2026-09-23', checkedAt: day(2, 11) }];
    // Future activity (a device with a wrong clock) is left out.
    input.practice = [...input.practice, practice('future', 'write', day(5))];
    const summary = summarize(input, {
      timeZone: TZ,
      weeklyGoal: 3,
      now: new Date(day(2, 12)),
    });
    expect(summary.today).toBe('2026-09-23');
    expect(summary.questDays.map((d) => d.day)).toEqual([
      '2026-09-21',
      '2026-09-22',
      '2026-09-23',
    ]);
    expect(summary.quests.bonusAt).not.toBeNull();
    expect(summary.streak).toMatchObject({ current: 3, activeToday: true });
    expect(summary.weekly).toMatchObject({ met: true, activeDays: 3, streak: 1 });
    expect(summary.xpEvents.filter((e) => e.kind === 'quest-bonus')).toHaveLength(3);
    expect(summary.weekXp).toBe(summary.totalXp);
    expect(summary.todayXp).toBeLessThan(summary.totalXp);
    expect(summary.xpEvents.some((e) => e.ref === 'future')).toBe(false);
  });

  it('lists the last days for week strips', () => {
    expect(lastDays('2026-09-24', 3)).toEqual(['2026-09-22', '2026-09-23', '2026-09-24']);
  });
});
