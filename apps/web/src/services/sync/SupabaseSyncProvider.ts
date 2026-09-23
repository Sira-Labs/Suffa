/**
 * SupabaseSyncProvider – konkrete Sync-Implementierung gegen Supabase.
 *
 * - Auth: Magic-Link (OTP per E-Mail), kein Passwort.
 * - Datenzugriff: pro Tabelle Upsert (push) und „updated_at > since“-Pull.
 * - Sicherheit: Row-Level-Security im Backend (user_id = auth.uid()); der Client
 *   sendet absichtlich KEIN user_id-Feld in den Lerndaten – Supabase setzt es per
 *   DEFAULT auth.uid() bzw. die RLS-Policy erzwingt es (siehe supabase/policies.sql).
 *
 * Fehler werden spezifisch als Result zurückgegeben (kein blindes catch-all);
 * unerwartete Ausnahmen werden geloggt und in einen typisierten Fehler übersetzt.
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
  /** Wohin der Magic-Link zurückführt (Standard: aktuelle Origin). */
  redirectTo?: string;
}

export class SupabaseSyncProvider implements SyncProvider {
  readonly name = 'supabase';
  private readonly client: SupabaseClient;
  private readonly redirectTo: string | undefined;

  constructor(config: SupabaseConfig) {
    if (!config.url || !config.anonKey) {
      throw new Error('SupabaseSyncProvider benötigt url und anonKey.');
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
    // Synchroner Zugriff auf den zuletzt bekannten User (aus onAuthChange/getSession).
    return toAuthState(this.lastKnownUser);
  }

  onAuthChange(listener: AuthListener): () => void {
    const { data } = this.client.auth.onAuthStateChange((_event, session) => {
      this.lastKnownUser = session?.user ?? null;
      listener(toAuthState(this.lastKnownUser));
    });
    // Initialen Zustand nachreichen.
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
      log.warn('signInWithOtp fehlgeschlagen', { message: error.message });
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
          message: 'Kein angemeldeter Nutzer für Push.',
        },
      };
    }
    // user_id mitsenden: Karten-IDs sind pro Nutzer deterministisch (z. B.
    // "vocab_ar_de:v-ism") und damit nur in Kombination mit user_id eindeutig.
    // Der Conflict-Key ist deshalb (user_id, id). RLS prüft zusätzlich user_id.
    const stamped = records.map((r) => ({ ...r, user_id: userId }));
    try {
      const { error } = await this.client.from(table).upsert(stamped, {
        onConflict: 'user_id,id',
      });
      if (error) {
        log.warn('push fehlgeschlagen', {
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
      const message = cause instanceof Error ? cause.message : 'Unbekannter Push-Fehler';
      log.error('push-Ausnahme', { table, message });
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
        log.warn('pull fehlgeschlagen', {
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
      const message = cause instanceof Error ? cause.message : 'Unbekannter Pull-Fehler';
      log.error('pull-Ausnahme', { table, message });
      return { ok: false, error: { code: 'pull-exception', message } };
    }
  }
}
