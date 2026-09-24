import { describe, expect, it } from 'vitest';
import { content } from '@/content';
import { inReachedUnits, introducibleRefs } from './reach';

describe('reach', () => {
  it('keeps items of reached units and items without a unit', () => {
    const keep = inReachedUnits([1, 2]);
    expect(keep({ einheit: 2 })).toBe(true);
    expect(keep({ einheit: 3 })).toBe(false);
    expect(keep({ einheit: undefined })).toBe(true);
  });

  it('lets new cards come only from reached units and own words', () => {
    const refs = introducibleRefs(content, [1], [{ id: 'own-1' }]);
    const unit1 = content.vokabeln.filter((v) => v.einheit === 1);
    const unit2 = content.vokabeln.filter((v) => v.einheit === 2);
    for (const v of unit1) expect(refs.has(v.id)).toBe(true);
    for (const v of unit2) expect(refs.has(v.id)).toBe(false);
    expect(refs.has('own-1')).toBe(true);
  });
});
