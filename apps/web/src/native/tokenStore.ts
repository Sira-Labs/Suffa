/**
 * The app's session token (Better Auth bearer mode). It lives in the Keychain / Keystore via
 * the secure storage plugin; without that plugin in the shell it falls back to Capacitor
 * Preferences, and without either it is kept in memory only (sign-in per app start).
 * A browser never uses this: the web keeps its httpOnly cookie.
 */
import { logger } from '@/services/logger';
import type { KeyValuePlugin } from './capacitor';

const log = logger.child('native:token');
const KEY = 'suffa.session';

export interface TokenStore {
  /** Reads the stored token once at start. */
  load(): Promise<string | null>;
  save(token: string): Promise<void>;
  clear(): Promise<void>;
  /** The token in memory, for request headers. */
  current(): string | null;
}

export function createTokenStore(storage: KeyValuePlugin | null): TokenStore {
  let token: string | null = null;
  if (!storage)
    log.warn('no token storage in this app shell; sign-in lasts one app start');

  return {
    async load() {
      if (!storage) return token;
      try {
        token = (await storage.get({ key: KEY })).value || null;
      } catch (error) {
        // The secure storage plugin rejects a missing key instead of answering null.
        log.debug('no stored session', { error: String(error) });
        token = null;
      }
      return token;
    },
    async save(next) {
      token = next;
      await storage?.set({ key: KEY, value: next });
    },
    async clear() {
      token = null;
      try {
        await storage?.remove({ key: KEY });
      } catch (error) {
        log.debug('nothing to remove', { error: String(error) });
      }
    },
    current: () => token,
  };
}
