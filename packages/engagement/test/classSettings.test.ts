import { describe, expect, it } from 'vitest';
import {
  AREA_IDS,
  DEFAULT_UNLOCKS,
  areaAccess,
  isAreaId,
  isPaletteId,
  reachedPosition,
  ruleFor,
} from '../src/classSettings.js';
import { exam } from './fixtures.js';

const passed = (unit: number) =>
  exam([unit], 10, 10, `2026-10-0${(unit % 9) + 1}T10:00:00Z`);

describe('class settings', () => {
  it('opens roots from unit 3 by default and everything else at once', () => {
    expect(ruleFor(null, 'roots')).toEqual({ mode: 'unit', unit: 3 });
    expect(AREA_IDS.filter((a) => DEFAULT_UNLOCKS[a].mode !== 'open')).toEqual(['roots']);
    expect(ruleFor({ roots: { mode: 'open' } }, 'roots')).toEqual({ mode: 'open' });
  });

  it('counts how far a learner got within the course', () => {
    expect(reachedPosition('bayna-yadayk', [])).toBe(1);
    expect(reachedPosition('bayna-yadayk', [passed(1)])).toBe(2);
    expect(reachedPosition('bayna-yadayk', [passed(1), passed(2)])).toBe(3);
    // Medina lessons are numbered from 101: the position is still "lesson 2".
    expect(reachedPosition('madinah', [passed(101)])).toBe(2);
    expect(reachedPosition('madinah', [passed(1), passed(2)])).toBe(1);
  });

  it('tells open, unit and closed areas apart', () => {
    expect(areaAccess({ mode: 'open' }, 1)).toEqual({ open: true });
    expect(areaAccess({ mode: 'unit', unit: 3 }, 2)).toEqual({
      open: false,
      reason: 'unit',
      unit: 3,
    });
    expect(areaAccess({ mode: 'unit', unit: 3 }, 3)).toEqual({ open: true });
    expect(areaAccess({ mode: 'closed' }, 16)).toEqual({ open: false, reason: 'closed' });
  });

  it('knows its ids', () => {
    expect(isPaletteId('meer')).toBe(true);
    expect(isPaletteId('neon')).toBe(false);
    expect(isAreaId('roots')).toBe(true);
    expect(isAreaId('tutor')).toBe(false);
  });
});
