/**
 * Provider factory: reads the configuration from the Vite env variables and
 * decides whether a real Supabase provider or the NoopSyncProvider
 * (pure offline mode) is created. No secrets in code – only `.env`.
 */
import { logger } from '@/services/logger';
import { NoopSyncProvider } from './NoopSyncProvider';
import { SupabaseSyncProvider } from './SupabaseSyncProvider';
import type { SyncProvider } from './provider';

const log = logger.child('sync:factory');

export function createSyncProvider(): SyncProvider {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  const enabled = import.meta.env.VITE_SYNC_ENABLED !== 'false';

  if (!enabled) {
    log.info('Sync disabled via VITE_SYNC_ENABLED=false → offline mode');
    return new NoopSyncProvider();
  }

  if (!url || !anonKey) {
    log.info('No Supabase configuration found → offline mode (noop)');
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
