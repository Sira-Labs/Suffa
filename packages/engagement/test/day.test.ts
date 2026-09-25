import { describe, expect, it } from 'vitest';
import {
  addDays,
  dayKey,
  daysBetween,
  isTimeZone,
  localHour,
  weekStart,
} from '../src/index.js';

describe('days in the learner time zone', () => {
  it('ends the day at local midnight, not at UTC midnight', () => {
    expect(dayKey('2026-09-24T22:30:00.000Z', 'Europe/Zurich')).toBe('2026-09-25');
    expect(dayKey(new Date('2026-09-24T22:30:00.000Z'), 'UTC')).toBe('2026-09-24');
    expect(dayKey('2026-09-25T03:00:00.000Z', 'America/New_York')).toBe('2026-09-24');
    expect(localHour('2026-09-24T05:30:00.000Z', 'Europe/Zurich')).toBe(7);
    expect(localHour('2026-09-24T22:10:00.000Z', 'Europe/Zurich')).toBe(0);
  });

  it('knows real time zones only', () => {
    expect(isTimeZone('Asia/Riyadh')).toBe(true);
    expect(isTimeZone('Mars/Olympus')).toBe(false);
    // Only a wrong zone name means "no"; a programming error still surfaces.
    expect(() => isTimeZone(Symbol('zone') as unknown as string)).toThrow(TypeError);
  });

  it('counts calendar days and weeks from Monday', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(daysBetween('2026-09-20', '2026-09-24')).toBe(4);
    expect(weekStart('2026-09-24')).toBe('2026-09-21'); // Thursday → Monday
    expect(weekStart('2026-09-27')).toBe('2026-09-21'); // Sunday belongs to that week
    expect(weekStart('2026-09-21')).toBe('2026-09-21');
  });
});
