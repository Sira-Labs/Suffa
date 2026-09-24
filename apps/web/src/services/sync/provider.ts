/**
 * SyncProvider interface (dependency injection).
 *
 * The backend is encapsulated behind this interface so it stays replaceable
 * (Supabase today, e.g. PocketBase/self-hosting for data sovereignty later).
 * Concrete implementations: SupabaseSyncProvider, NoopSyncProvider.
 */
import type { SyncTable } from '@/types';

/** Minimal record as transported by the provider. */
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

/** Result type without exceptions for expected error paths. */
export type Result<T> = { ok: true; value: T } | { ok: false; error: SyncProviderError };

export interface SyncProvider {
  /** Unique name (for UI/logging). */
  readonly name: string;

  /** Is a real backend configured at all? */
  isConfigured(): boolean;

  getAuthState(): AuthState;
  onAuthChange(listener: AuthListener): () => void;

  /** Trigger a magic-link login via email. */
  /** `returnTo`: in-app path the link leads back to (backends may ignore it). */
  signInWithEmail(email: string, returnTo?: string): Promise<Result<void>>;
  signOut(): Promise<Result<void>>;

  /**
   * Does the backend store this table? Omitted = every table. The engine skips the others and
   * keeps their outbox for a backend that does.
   */
  supportsTable?(table: SyncTable): boolean;

  /** Upload a table's changed records (upsert). */
  push(table: SyncTable, records: SyncableRecord[]): Promise<Result<void>>;

  /**
   * Fetch records the backend stored after `since` – a watermark from an earlier pull, not a
   * record timestamp – and the watermark to continue from next time (null: keep the old one).
   */
  pull(table: SyncTable, since: string | null): Promise<Result<PullResult>>;
}

export interface PullResult {
  records: SyncableRecord[];
  watermark: string | null;
}
