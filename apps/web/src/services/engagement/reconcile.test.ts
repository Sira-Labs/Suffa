import { describe, expect, it } from 'vitest';
import { summarize, type EngagementInput } from '@suffa/engagement';
import type { ServerEngagement } from '@/services/sync/ApiSyncProvider';
import { reconcile } from './reconcile';

const input: EngagementInput = {
  reviews: [{ cardId: 'a', rating: 'good', reviewedAt: '2026-09-24T08:00:00.000Z' }],
  tracks: [],
  practice: [],
  checkIns: [],
  exams: [],
  enrollments: [],
  lessonSizes: new Map(),
};
const local = summarize(input, {
  timeZone: 'UTC',
  weeklyGoal: 5,
  now: new Date('2026-09-24T12:00:00.000Z'),
});
const server = (over: Partial<ServerEngagement> = {}): ServerEngagement => ({
  totalXp: 400,
  level: 5,
  streak: { current: 3, longest: 9, shields: 1 },
  rulesVersion: 1,
  rejected: 0,
  computedAt: '2026-09-24T09:00:00.000Z',
  achievements: [],
  ...over,
});

describe('reconcile with the server (story 5.4)', () => {
  it('keeps local values without a server copy', () => {
    expect(reconcile(local, null, 0)).toBe(local);
  });

  it('takes the server total once everything is uploaded and it caught up', () => {
    const merged = reconcile(local, server(), 0);
    expect(merged.totalXp).toBe(400);
    expect(merged.level.level).toBe(5);
  });

  it('stays local while uploads are pending or the server is behind', () => {
    expect(reconcile(local, server(), 2).totalXp).toBe(local.totalXp);
    expect(
      reconcile(local, server({ computedAt: '2026-09-24T07:00:00.000Z' }), 0).totalXp
    ).toBe(local.totalXp);
  });

  it('shows badges the server knows, even before the local history is back', () => {
    const merged = reconcile(
      local,
      server({
        achievements: [
          { badgeId: 'mudawim', tier: 'silver', unlockedAt: '2026-08-01T00:00:00.000Z' },
          { badgeId: 'mudawim', tier: 'bronze', unlockedAt: '2026-07-01T00:00:00.000Z' },
          {
            badgeId: 'retired-badge',
            tier: 'gold',
            unlockedAt: '2026-07-01T00:00:00.000Z',
          },
        ],
      }),
      5
    );
    const streak = merged.badges.find((b) => b.badge.id === 'mudawim')!;
    expect(streak.unlocks.map((u) => [u.tier, u.threshold])).toEqual([
      ['bronze', 7],
      ['silver', 30],
    ]);
    expect(streak.next).toBe(100);
    expect(merged.achievements).toHaveLength(2);
  });
});
