import { describe, expect, it } from 'vitest';
import { PerPersonLimiter } from '../src/live/handLimit.js';

describe('PerPersonLimiter', () => {
  const minute = 60_000;
  // A clock like the real one: far from zero, where `RateLimiter` has its first window.
  const start = 1_700_000_000_000;

  it('limits each person by themselves and starts again after the window', () => {
    let now = start;
    const limiter = new PerPersonLimiter({ limit: 2, windowMs: minute, now: () => now });
    expect(limiter.tryTake('a')).toBe(true);
    expect(limiter.tryTake('a')).toBe(true);
    expect(limiter.tryTake('a')).toBe(false);
    expect(limiter.tryTake('b')).toBe(true);

    now += minute - 1;
    expect(limiter.tryTake('a')).toBe(false);
    now += 1;
    expect(limiter.tryTake('a')).toBe(true);
  });

  it('forgets people whose window is over once it holds too many, and nobody else', () => {
    let now = start;
    const limiter = new PerPersonLimiter({
      limit: 1,
      windowMs: minute,
      kept: 2,
      now: () => now,
    });
    expect(limiter.tryTake('old')).toBe(true);
    now += minute / 2;
    expect(limiter.tryTake('recent')).toBe(true);
    now += minute / 2;

    // A third person comes: "old" has been idle for a whole window and goes, "recent" stays
    // and is still held to the limit.
    expect(limiter.tryTake('new')).toBe(true);
    expect(limiter.size).toBe(2);
    expect(limiter.tryTake('recent')).toBe(false);
    expect(limiter.tryTake('new')).toBe(false);
  });

  it('keeps everyone while all of them are within their window', () => {
    const limiter = new PerPersonLimiter({
      limit: 1,
      windowMs: minute,
      kept: 2,
      now: () => start,
    });
    for (const id of ['a', 'b', 'c']) expect(limiter.tryTake(id)).toBe(true);
    expect(limiter.size).toBe(3);
    for (const id of ['a', 'b', 'c']) expect(limiter.tryTake(id)).toBe(false);
  });
});
