/**
 * SupabaseSyncProvider – concrete sync implementation against Supabase.
 *
 * - Auth: magic link (OTP via email), no password.
 * - Data access: per-table upsert (push) and "updated_at > since" pull.
 * - Security: row-level security in the backend (user_id = auth.uid()); the client
 *   deliberately sends NO user_id field in the learning data – Supabase sets it via
 *   DEFAULT auth.uid() and the RLS policy enforces it (see supabase/policies.sql).
 *
 * Errors are returned specifically as a Result (no blind catch-all);
 * unexpected exceptions are logged and translated into a typed error.
 */
import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';
import type { SyncTable } from '@/types';
import type {
  AuthListener,
  AuthState,
  Result,
  SyncProvider,
  SyncableRecord,
} from './provider';
import { logger } from '@/services/logger';

const log = logger.child('sync:supabase');

function toAuthState(user: User | null): AuthState {
  if (!user) return { status: 'signed-out' };
  return { status: 'signed-in', user: { id: user.id, email: user.email ?? null } };
}

export interface SupabaseConfig {
  url: string;
  anonKey: string;
  /** Where the magic link leads back to (default: current origin). */
  redirectTo?: string;
}

const SUPABASE_TABLES: ReadonlySet<SyncTable> = new Set<SyncTable>([
  'srs_cards',
  'review_logs',
  'exam_results',
  'settings',
  'user_vocab',
]);

export class SupabaseSyncProvider implements SyncProvider {
  readonly name = 'supabase';

  /** The legacy Supabase schema has only the original five tables (supabase/schema.sql). */
  supportsTable(table: SyncTable): boolean {
    return SUPABASE_TABLES.has(table);
  }
  private readonly client: SupabaseClient;
  private readonly redirectTo: string | undefined;

  constructor(config: SupabaseConfig) {
    if (!config.url || !config.anonKey) {
      throw new Error('SupabaseSyncProvider requires url and anonKey.');
    }
    this.client = createClient(config.url, config.anonKey, {
      auth: { persistSession: true, autoRefreshToken: true },
    });
    this.redirectTo = config.redirectTo;
  }

  isConfigured(): boolean {
    return true;
  }

  private lastKnownUser: User | null = null;

  getAuthState(): AuthState {
    // Synchronous access to the last known user (from onAuthChange/getSession).
    return toAuthState(this.lastKnownUser);
  }

  onAuthChange(listener: AuthListener): () => void {
    const { data } = this.client.auth.onAuthStateChange((_event, session) => {
      this.lastKnownUser = session?.user ?? null;
      listener(toAuthState(this.lastKnownUser));
    });
    // Deliver the initial state as well.
    void this.client.auth.getSession().then(({ data: sessionData }) => {
      this.lastKnownUser = sessionData.session?.user ?? null;
      listener(toAuthState(this.lastKnownUser));
    });
    return () => data.subscription.unsubscribe();
  }

  async signInWithEmail(email: string): Promise<Result<void>> {
    const trimmed = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      return {
        ok: false,
        error: { code: 'invalid-email', message: 'Ungültige E-Mail-Adresse.' },
      };
    }
    const { error } = await this.client.auth.signInWithOtp({
      email: trimmed,
      options: this.redirectTo ? { emailRedirectTo: this.redirectTo } : undefined,
    });
    if (error) {
      log.warn('signInWithOtp failed', { message: error.message });
      return { ok: false, error: { code: 'auth-failed', message: error.message } };
    }
    return { ok: true, value: undefined };
  }

  async signOut(): Promise<Result<void>> {
    const { error } = await this.client.auth.signOut();
    if (error) {
      return { ok: false, error: { code: 'signout-failed', message: error.message } };
    }
    this.lastKnownUser = null;
    return { ok: true, value: undefined };
  }

  async push(table: SyncTable, records: SyncableRecord[]): Promise<Result<void>> {
    if (records.length === 0) return { ok: true, value: undefined };
    const userId = this.lastKnownUser?.id;
    if (!userId) {
      return {
        ok: false,
        error: {
          code: 'not-authenticated',
          message: 'No signed-in user for push.',
        },
      };
    }
    // Send user_id along: card IDs are deterministic per user (e.g.
    // "vocab_ar_de:v-ism") and thus only unique in combination with user_id.
    // The conflict key is therefore (user_id, id). RLS additionally checks user_id.
    const stamped = records.map((r) => ({ ...r, user_id: userId }));
    try {
      const { error } = await this.client.from(table).upsert(stamped, {
        onConflict: 'user_id,id',
      });
      if (error) {
        log.warn('push failed', {
          table,
          code: error.code,
          message: error.message,
        });
        return {
          ok: false,
          error: { code: error.code ?? 'push-failed', message: error.message },
        };
      }
      return { ok: true, value: undefined };
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Unknown push error';
      log.error('push exception', { table, message });
      return { ok: false, error: { code: 'push-exception', message } };
    }
  }

  async pull(table: SyncTable, since: string | null): Promise<Result<SyncableRecord[]>> {
    try {
      let query = this.client.from(table).select('*');
      if (since) {
        query = query.gt('updated_at', since);
      }
      const { data, error } = await query;
      if (error) {
        log.warn('pull failed', {
          table,
          code: error.code,
          message: error.message,
        });
        return {
          ok: false,
          error: { code: error.code ?? 'pull-failed', message: error.message },
        };
      }
      return { ok: true, value: (data ?? []) as SyncableRecord[] };
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Unknown pull error';
      log.error('pull exception', { table, message });
      return { ok: false, error: { code: 'pull-exception', message } };
    }
  }
}
