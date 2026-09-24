/**
 * Provider factory: reads the configuration from the Vite env variables and
 * decides whether a real Supabase provider or the NoopSyncProvider
 * (pure offline mode) is created. No secrets in code – only `.env`.
 */
import { logger } from '@/services/logger';
import { ApiSyncProvider } from './ApiSyncProvider';
import { NoopSyncProvider } from './NoopSyncProvider';
import { SupabaseSyncProvider } from './SupabaseSyncProvider';
import type { SyncProvider } from './provider';

const log = logger.child('sync:factory');

/**
 * VITE_SYNC_BACKEND picks the backend: `api` (Suffa's own API, same origin), `supabase` or
 * `off`. Without it: Supabase while its keys are set (until the migration, story 4.1),
 * otherwise the own API; the API provider falls back to offline mode by itself when the
 * server has no sign-in.
 */
export function createSyncProvider(): SyncProvider {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  const enabled = import.meta.env.VITE_SYNC_ENABLED !== 'false';
  const backend = import.meta.env.VITE_SYNC_BACKEND as string | undefined;

  if (!enabled || backend === 'off') {
    log.info('Sync disabled → offline mode');
    return new NoopSyncProvider();
  }

  if (backend === 'api' || (backend !== 'supabase' && (!url || !anonKey))) {
    log.info('Sync via the Suffa API (magic-link sign-in)');
    return new ApiSyncProvider();
  }

  if (!url || !anonKey) {
    log.info('VITE_SYNC_BACKEND=supabase without Supabase configuration → offline mode');
    return new NoopSyncProvider();
  }

  try {
    return new SupabaseSyncProvider({
      url,
      anonKey,
      redirectTo: typeof window !== 'undefined' ? window.location.origin : undefined,
    });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : 'unknown';
    log.error('Supabase provider initialization failed → offline mode', {
      message,
    });
    return new NoopSyncProvider();
  }
}
