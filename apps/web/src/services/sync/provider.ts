/**
 * SyncProvider-Interface (Dependency Injection).
 *
 * Das Backend ist hinter dieser Schnittstelle gekapselt, damit es austauschbar
 * bleibt (Supabase heute, z. B. PocketBase/Self-Hosting für Datenhoheit später).
 * Konkrete Implementierungen: SupabaseSyncProvider, NoopSyncProvider.
 */
import type { SyncTable } from '@/types';

/** Minimaler Datensatz, wie ihn der Provider transportiert. */
export interface SyncableRecord {
  id: string;
  updated_at: string;
  deleted: boolean;
  [key: string]: unknown;
}

export interface AuthUser {
  id: string;
  email: string | null;
}

export type AuthState =
  | { status: 'signed-out' }
  | { status: 'signed-in'; user: AuthUser };

export type AuthListener = (state: AuthState) => void;

export interface SyncProviderError {
  code: string;
  message: string;
}

/** Ergebnis-Typ ohne Exceptions für erwartbare Fehlerpfade. */
export type Result<T> = { ok: true; value: T } | { ok: false; error: SyncProviderError };

export interface SyncProvider {
  /** Eindeutiger Name (für UI/Logging). */
  readonly name: string;

  /** Ist überhaupt ein echtes Backend konfiguriert? */
  isConfigured(): boolean;

  getAuthState(): AuthState;
  onAuthChange(listener: AuthListener): () => void;

  /** Magic-Link-Login per E-Mail anstoßen. */
  signInWithEmail(email: string): Promise<Result<void>>;
  signOut(): Promise<Result<void>>;

  /** Geänderte Datensätze einer Tabelle hochladen (Upsert). */
  push(table: SyncTable, records: SyncableRecord[]): Promise<Result<void>>;

  /** Datensätze abrufen, die nach `since` (ISO) geändert wurden. */
  pull(table: SyncTable, since: string | null): Promise<Result<SyncableRecord[]>>;
}
