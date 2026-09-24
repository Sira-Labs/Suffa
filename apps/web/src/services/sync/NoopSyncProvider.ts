/**
 * NoopSyncProvider – pure offline mode without login.
 *
 * Implements the SyncProvider interface but does nothing: no network, no account.
 * This keeps the app fully usable without a Supabase configuration; a later
 * "sign in & upload" is possible by setting a real provider.
 */
import type { SyncTable } from '@/types';
import type {
  PullResult,
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
    // No auth changes possible.
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

  async pull(_table: SyncTable, _since: string | null): Promise<Result<PullResult>> {
    return { ok: true, value: { records: [], watermark: null } };
  }
}
