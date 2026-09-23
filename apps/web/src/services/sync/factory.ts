/**
 * Provider-Factory: liest die Konfiguration aus den Vite-Env-Variablen und
 * entscheidet, ob ein echter Supabase-Provider oder der NoopSyncProvider
 * (reiner Offline-Betrieb) erstellt wird. Keine Secrets im Code – nur `.env`.
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
    log.info('Sync per VITE_SYNC_ENABLED=false deaktiviert → Offline-Modus');
    return new NoopSyncProvider();
  }

  if (!url || !anonKey) {
    log.info('Keine Supabase-Konfiguration gefunden → Offline-Modus (Noop)');
    return new NoopSyncProvider();
  }

  try {
    return new SupabaseSyncProvider({
      url,
      anonKey,
      redirectTo: typeof window !== 'undefined' ? window.location.origin : undefined,
    });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : 'unbekannt';
    log.error('Supabase-Provider-Initialisierung fehlgeschlagen → Offline-Modus', {
      message,
    });
    return new NoopSyncProvider();
  }
}
