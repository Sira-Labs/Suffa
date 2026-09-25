import { describe, expect, it } from 'vitest';
import { levelFor, xpForLevel } from '../src/index.js';

describe('levels', () => {
  it('follows 50·n^1.5', () => {
    expect([1, 2, 3, 4, 5].map(xpForLevel)).toEqual([0, 50, 141, 260, 400]);
  });

  it('places XP inside a level', () => {
    expect(levelFor(0)).toEqual({ level: 1, into: 0, span: 50 });
    expect(levelFor(50)).toEqual({ level: 2, into: 0, span: 91 });
    expect(levelFor(350)).toEqual({ level: 4, into: 90, span: 140 });
  });
});
