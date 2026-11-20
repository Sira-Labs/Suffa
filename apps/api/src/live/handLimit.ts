/**
 * A limit per person, kept in this process's memory like the limits on speech and sharing:
 * with several API instances a person gets the limit on each, which still bounds what
 * reaches the room, and a restart forgets it.
 */
import { RateLimiter } from '../observability/tunnel.js';

export interface PerPersonLimitOptions {
  /** Calls one person may make per window. */
  limit: number;
  windowMs: number;
  /** People whose limit is kept; beyond it, those whose window is over are dropped. */
  kept?: number;
  now?: () => number;
}

export class PerPersonLimiter {
  private readonly people = new Map<string, { limiter: RateLimiter; usedAt: number }>();
  private readonly kept: number;
  private readonly now: () => number;

  constructor(private readonly options: PerPersonLimitOptions) {
    this.kept = options.kept ?? 5000;
    this.now = options.now ?? Date.now;
  }

  /** Counts one call of `personId`; false once their window is used up. */
  tryTake(personId: string): boolean {
    const at = this.now();
    let entry = this.people.get(personId);
    if (!entry) {
      if (this.people.size >= this.kept) this.dropIdle(at);
      entry = {
        limiter: new RateLimiter(this.options.limit, this.options.windowMs, this.now),
        usedAt: at,
      };
      this.people.set(personId, entry);
    }
    const allowed = entry.limiter.tryTake();
    // Read after the limiter read the clock: never earlier than the start of its window.
    entry.usedAt = this.now();
    return allowed;
  }

  /** How many people's limits are held right now. */
  get size(): number {
    return this.people.size;
  }

  // A window starts no later than the person's last call, so one unused for a whole window
  // has nothing left to count: dropping it never lets anyone exceed their limit.
  private dropIdle(at: number): void {
    for (const [id, entry] of this.people) {
      if (at - entry.usedAt >= this.options.windowMs) this.people.delete(id);
    }
  }
}
