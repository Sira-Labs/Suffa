/**
 * Provider factory: Suffa's own API (same origin, magic-link sign-in) or pure offline mode.
 * No secrets in code – the API is found by path, the session is an httpOnly cookie.
 */
import { logger } from '@/services/logger';
import { ApiSyncProvider } from './ApiSyncProvider';
import { NoopSyncProvider } from './NoopSyncProvider';
import type { SyncProvider } from './provider';

const log = logger.child('sync:factory');

/**
 * VITE_SYNC_BACKEND=off (or VITE_SYNC_ENABLED=false) keeps the app offline; anything else
 * syncs with the API, which falls back to offline mode by itself when the server has no
 * sign-in.
 */
export function createSyncProvider(): SyncProvider {
  const enabled = import.meta.env.VITE_SYNC_ENABLED !== 'false';
  const backend = import.meta.env.VITE_SYNC_BACKEND as string | undefined;
  if (!enabled || backend === 'off') {
    log.info('Sync disabled → offline mode');
    return new NoopSyncProvider();
  }
  log.info('Sync via the Suffa API (magic-link sign-in)');
  return new ApiSyncProvider();
}
