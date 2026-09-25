import { describe, expect, it } from 'vitest';
import { masteryByUnit } from '../src/classes/certificates.js';

describe('unit mastery for certificates (story 14.3)', () => {
  it('rounds down so a certificate needs the full 90 %', () => {
    const units = [
      { unit: 1, title: 'A', wordIds: Array.from({ length: 11 }, (_, i) => `w${i}`) },
      { unit: 2, title: 'B', wordIds: [] },
    ];
    const tenOfEleven = new Set(Array.from({ length: 10 }, (_, i) => `w${i}`));
    expect(masteryByUnit(tenOfEleven, units)).toEqual(new Map([[1, 90]]));
    const nine = new Set([...tenOfEleven].slice(0, 9));
    expect(masteryByUnit(nine, units).get(1)).toBe(81);
  });
});
