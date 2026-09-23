/**
 * Resolves the authenticated user of a request (dependency-injected into the routes).
 *
 * Until Better Auth lands (Sprint 3, ADR-0008) there are only two implementations:
 * - `DenyAllResolver` (default): every request is unauthenticated → sync answers 401.
 * - `DevTokenResolver`: static bearer tokens mapped to user ids, for tests and local
 *   development only; the config refuses it in prod.
 */
import { createHash, timingSafeEqual } from 'node:crypto';

export interface AuthResolver {
  /** Returns the user id for the request, or null when it is not authenticated. */
  resolve(headers: Headers): Promise<string | null>;
}

export class DenyAllResolver implements AuthResolver {
  async resolve(): Promise<null> {
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

  async resolve(headers: Headers): Promise<string | null> {
    const match = /^Bearer\s+(\S+)$/i.exec(headers.get('authorization') ?? '');
    if (!match?.[1]) return null;
    const presented = digest(match[1]);
    // Compare fixed-length digests in constant time; check all entries to avoid timing leaks.
    let userId: string | null = null;
    for (const entry of this.tokens) {
      if (timingSafeEqual(entry.hash, presented)) userId = entry.userId;
    }
    return userId;
  }
}
