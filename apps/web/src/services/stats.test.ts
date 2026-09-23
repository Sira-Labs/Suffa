import { describe, expect, it } from 'vitest';
import type { ReviewLog } from '@/types';
import { daysSinceLastReview, forgettingCurve, isStreakBroken } from './stats';

const log = (reviewedAt: string) => ({ reviewedAt, deleted: false }) as ReviewLog;
const now = new Date(2026, 8, 23, 10, 0);

describe('forgetting reminder', () => {
  it('counts calendar days since the last review', () => {
    expect(daysSinceLastReview([], now)).toBeNull();
    expect(daysSinceLastReview([log(new Date(2026, 8, 23, 8).toISOString())], now)).toBe(
      0
    );
    expect(
      daysSinceLastReview(
        [
          log(new Date(2026, 8, 19, 22).toISOString()),
          log(new Date(2026, 8, 20, 9).toISOString()),
        ],
        now
      )
    ).toBe(3);
  });

  it('reminds only once the streak is broken', () => {
    expect(isStreakBroken([], now)).toBe(false);
    expect(isStreakBroken([log(new Date(2026, 8, 22, 21).toISOString())], now)).toBe(
      false
    );
    expect(isStreakBroken([log(new Date(2026, 8, 21, 21).toISOString())], now)).toBe(
      true
    );
  });

  it('models retention falling day by day', () => {
    const curve = forgettingCurve([], 7);
    expect(curve[0]!.retention).toBe(1);
    expect(curve[1]!.retention).toBeLessThan(0.4);
    expect(curve.at(-1)!.retention).toBeLessThan(curve[1]!.retention);
  });
});
