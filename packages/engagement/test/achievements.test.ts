import { describe, expect, it } from 'vitest';
import {
  BADGES,
  badgeProgress,
  evaluateAchievements,
  type AchievementFacts,
} from '../src/index.js';
import { empty, exam, practice, review, track, TZ } from './fixtures.js';

const noFacts: AchievementFacts = {
  streakReachedOn: [],
  weeklyGoalsMetOn: [],
  allQuestsOn: [],
};
const at = (i: number) => new Date(Date.UTC(2026, 8, 1, 12) + i * 60_000).toISOString();

describe('achievements', () => {
  it('has a rule for every badge', () => {
    expect(evaluateAchievements(empty(), noFacts, TZ)).toEqual([]);
    for (const badge of BADGES) expect(badge.thresholds.length).toBeGreaterThan(0);
  });

  it('unlocks streak, weekly and quest badges from the facts', () => {
    const days = Array.from(
      { length: 30 },
      (_, i) => `2026-09-${String(i + 1).padStart(2, '0')}`
    );
    const unlocks = evaluateAchievements(
      empty(),
      { streakReachedOn: days, weeklyGoalsMetOn: days.slice(0, 4), allQuestsOn: days },
      TZ
    );
    expect(unlocks.map((u) => `${u.badgeId}:${u.tier}:${u.unlockedAt}`)).toEqual([
      'mudawim:bronze:2026-09-07',
      'mudawim:silver:2026-09-30',
      'talib:bronze:2026-09-04',
      'mujtahid:bronze:2026-09-10',
    ]);
  });

  it('counts mature cards once each, even if they lapse later', () => {
    const input = empty();
    input.reviews = [
      ...Array.from({ length: 100 }, (_, i) =>
        review(`c${i}`, 'good', at(i), { scheduledInterval: 21 })
      ),
      review('c0', 'again', at(200), { scheduledInterval: 1 }),
      review('c0', 'good', at(201), { scheduledInterval: 25 }),
      review('x', 'good', at(202), { scheduledInterval: 30, deleted: true }),
      review('y', 'good', at(203)),
    ];
    const hafiz = evaluateAchievements(input, noFacts, TZ).filter(
      (u) => u.badgeId === 'hafiz'
    );
    expect(hafiz).toEqual([
      { badgeId: 'hafiz', tier: 'bronze', threshold: 100, unlockedAt: at(99) },
    ]);
  });

  it('rewards early days, skills, lessons, perfect tests and stages', () => {
    const input = empty();
    // 06:30 in Zurich on 10 different days (one review and one practice on the first).
    const early = (d: number) => new Date(Date.UTC(2026, 8, 1 + d, 4, 30)).toISOString();
    input.reviews = Array.from({ length: 10 }, (_, d) =>
      review(`e${d}`, 'good', early(d))
    );
    input.practice = [
      practice('p0', 'read', early(0)),
      ...Array.from({ length: 25 }, (_, i) => practice(`w${i}`, 'write', at(i))),
      ...Array.from({ length: 25 }, (_, i) => practice(`s${i}`, 'speak', at(i))),
      ...Array.from({ length: 5 }, (_, i) => practice(`v${i}`, 'verbs', at(i))),
      practice('gone', 'verbs', at(9), true),
    ];
    input.lessonSizes = new Map(
      Array.from({ length: 5 }, (_, i) => [`l${i}`, 1] as [string, number])
    );
    input.tracks = [
      ...Array.from({ length: 5 }, (_, i) => track(`t${i}`, `l${i}`, at(i))),
      track('open', 'l9', null),
      track('gone', 'l8', at(1), true),
      track('unsized', 'l7', at(1)),
    ];
    input.exams = [
      exam([1], 10, 10, at(1)),
      exam([2], 0, 0, at(2)),
      exam([3], 10, 10, at(3), 'mixed_chapter', true),
      exam([1, 2, 3, 4, 5, 6, 7, 8], 45, 50, at(4), 'stage_test'),
    ];
    const ids = evaluateAchievements(input, noFacts, TZ).map(
      (u) => `${u.badgeId}:${u.tier}`
    );
    expect(ids).toEqual([
      'bukur:bronze',
      'mustami:bronze',
      'khattat:bronze',
      'mutakallim:bronze',
      'mutasarrif:bronze',
      'najm:bronze',
      'stage-1:bronze',
    ]);
  });

  it('reports progress towards the next tier', () => {
    const days = Array.from(
      { length: 12 },
      (_, i) => `2026-09-${String(i + 1).padStart(2, '0')}`
    );
    const progress = badgeProgress(
      empty(),
      { streakReachedOn: days, weeklyGoalsMetOn: [], allQuestsOn: [] },
      TZ
    );
    expect(progress.find((p) => p.badge.id === 'mudawim')).toMatchObject({
      count: 12,
      next: 30,
      unlocks: [{ tier: 'bronze' }],
    });
    expect(progress.find((p) => p.badge.id === 'talib')).toMatchObject({
      count: 0,
      next: 4,
    });
    const done = badgeProgress(
      empty(),
      { streakReachedOn: [], weeklyGoalsMetOn: [], allQuestsOn: [] },
      TZ
    ).find((p) => p.badge.id === 'stage-1');
    expect(done?.next).toBe(1);
  });
});
