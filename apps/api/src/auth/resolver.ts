/**
 * Resolves the authenticated user of a request (dependency-injected into the routes).
 *
 * Implementations:
 * - `SessionResolver` (betterAuth.ts): the session cookie of a magic-link sign-in.
 * - `DenyAllResolver` (default): every request is unauthenticated → protected routes 401.
 * - `DevTokenResolver`: static bearer tokens mapped to user ids, for tests and local
 *   development only; the config refuses it in prod. Dev tokens always act as students.
 */
import { createHash, timingSafeEqual } from 'node:crypto';
import type { Actor } from '../authz/policies.js';

export interface AuthResolver {
  /** The signed-in person with their platform role, or null when unauthenticated. */
  actor(headers: Headers): Promise<Actor | null>;
}

export class DenyAllResolver implements AuthResolver {
  async actor(): Promise<null> {
    return null;
  }
}

function digest(value: string): Buffer {
  return createHash('sha256').update(value).digest();
}

export class DevTokenResolver implements AuthResolver {
  private readonly tokens: Array<{ hash: Buffer; userId: string }>;

  constructor(tokens: ReadonlyMap<string, string>) {
    this.tokens = [...tokens].map(([token, userId]) => ({ hash: digest(token), userId }));
  }

  async actor(headers: Headers): Promise<Actor | null> {
    const match = /^Bearer\s+(\S+)$/i.exec(headers.get('authorization') ?? '');
    if (!match?.[1]) return null;
    const presented = digest(match[1]);
    // Compare fixed-length digests in constant time; check all entries to avoid timing leaks.
    let userId: string | null = null;
    for (const entry of this.tokens) {
      if (timingSafeEqual(entry.hash, presented)) userId = entry.userId;
    }
    return userId ? { id: userId, role: 'student' } : null;
  }
}
