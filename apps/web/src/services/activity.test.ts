import { describe, expect, it } from 'vitest';
import { activityHeatmap, activityLabel } from './activity';

const review = (reviewedAt: string, id = 'c1') => ({
  id: `r-${reviewedAt}-${id}`,
  cardId: id,
  rating: 'good' as const,
  reviewedAt,
  deleted: false,
});

describe('activityHeatmap', () => {
  it('counts practice and listening, not only card reviews', () => {
    const cells = activityHeatmap(
      {
        reviews: [review('2026-09-25T10:00:00Z')],
        practice: [
          {
            id: 'p1',
            unit: 1,
            skill: 'speak',
            itemId: 'd1#0',
            practisedAt: '2026-09-26T06:00:00Z',
            deleted: false,
          },
          {
            id: 'p2',
            unit: 1,
            skill: 'write',
            itemId: 'w1',
            practisedAt: '2026-09-26T06:05:00Z',
            deleted: false,
          },
        ],
        tracks: [{ id: 'u1-l1-t1', completedAt: '2026-09-26T07:00:00Z', deleted: false }],
      } as never,
      'Europe/Berlin',
      3,
      new Date('2026-09-26T08:00:00Z')
    );
    expect(cells.map((c) => c.date)).toEqual(['2026-09-24', '2026-09-25', '2026-09-26']);
    expect(cells[1]).toMatchObject({ total: 1, reviews: 1 });
    expect(cells[2]).toMatchObject({ total: 3, practice: 2, tracks: 1, reviews: 0 });
    expect(activityLabel(cells[2]!)).toBe('2026-09-26: 2 Übungen, 1 Audios/Videos');
    expect(activityLabel(cells[0]!)).toBe('2026-09-24: keine Aktivität');
  });

  it("counts on the learner's own day, not the UTC day", () => {
    // 00:30 in Berlin on the 26th is still the 25th in UTC.
    const cells = activityHeatmap(
      { reviews: [review('2026-09-25T22:30:00Z')], practice: [], tracks: [] } as never,
      'Europe/Berlin',
      2,
      new Date('2026-09-26T08:00:00Z')
    );
    expect(cells.map((c) => [c.date, c.total])).toEqual([
      ['2026-09-25', 0],
      ['2026-09-26', 1],
    ]);
  });
});
