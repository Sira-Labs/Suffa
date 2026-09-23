/**
 * NoopSyncProvider – reiner Offline-Betrieb ohne Login.
 *
 * Erfüllt das SyncProvider-Interface, tut aber nichts: kein Netzwerk, kein Konto.
 * So bleibt die App ohne Supabase-Konfiguration voll nutzbar; ein späteres
 * „Anmelden & hochladen“ ist möglich, indem ein echter Provider gesetzt wird.
 */
import type { SyncTable } from '@/types';
import type {
  AuthListener,
  AuthState,
  Result,
  SyncProvider,
  SyncableRecord,
} from './provider';

export class NoopSyncProvider implements SyncProvider {
  readonly name = 'noop';

  isConfigured(): boolean {
    return false;
  }

  getAuthState(): AuthState {
    return { status: 'signed-out' };
  }

  onAuthChange(_listener: AuthListener): () => void {
    // Kein Auth-Wechsel möglich.
    return () => undefined;
  }

  async signInWithEmail(_email: string): Promise<Result<void>> {
    return {
      ok: false,
      error: {
        code: 'sync-disabled',
        message: 'Synchronisation ist nicht konfiguriert (reiner Offline-Modus).',
      },
    };
  }

  async signOut(): Promise<Result<void>> {
    return { ok: true, value: undefined };
  }

  async push(_table: SyncTable, _records: SyncableRecord[]): Promise<Result<void>> {
    return { ok: true, value: undefined };
  }

  async pull(
    _table: SyncTable,
    _since: string | null
  ): Promise<Result<SyncableRecord[]>> {
    return { ok: true, value: [] };
  }
}
