/**
 * Sync against Suffa's own API (ADR-0007/0008, story 3.3). Sign-in is by magic link: the API
 * mails a link, opening it sets an httpOnly session cookie on this origin, and every request
 * below carries that cookie. No token ever lives in the browser's storage.
 *
 * The API may run without sign-in (no SMTP configured): `/api/v1/me` then answers 404 and the
 * provider reports itself unavailable, so the app stays in offline mode.
 */
import type { SyncTable } from '@/types';
import { logger } from '@/services/logger';
import type {
  PullResult,
  AuthListener,
  AuthState,
  Result,
  SyncProvider,
  SyncableRecord,
} from './provider';

const log = logger.child('sync:api');

/** The API accepts at most this many records per push. */
export const PUSH_BATCH = 500;
/** Where the magic link brings the learner back to. */
export const SIGN_IN_RETURN_PATH = '/settings?angemeldet=1';

export interface ApiUser {
  id: string;
  email: string;
  name: string | null;
  role: 'student' | 'teacher' | 'admin';
  /** IANA time zone of the account, null until set. */
  timeZone: string | null;
}

/** A signed-in device as the account page lists it (story 3.4). */
export interface DeviceSession {
  id: string;
  createdAt: string;
  lastActiveAt: string;
  expiresAt: string;
  userAgent: string | null;
  /** The session of this browser. */
  current: boolean;
}

interface PullPage {
  records: SyncableRecord[];
  next: { since: string; afterId: string } | null;
  /** Server time of the page's last record. */
  watermark: string | null;
}

type Fetch = typeof fetch;

const SIGNED_OUT: AuthState = { status: 'signed-out' };

/** The server's copy of the learner's engagement (GET /api/v1/engagement). */
export interface ServerEngagement {
  totalXp: number;
  level: number;
  streak: { current: number; longest: number; shields: number };
  rulesVersion: number;
  rejected: number;
  computedAt: string;
  achievements: {
    badgeId: string;
    tier: 'bronze' | 'silver' | 'gold';
    unlockedAt: string;
  }[];
}

export class ApiSyncProvider implements SyncProvider {
  readonly name = 'suffa-api';

  private state: AuthState = SIGNED_OUT;
  private me: ApiUser | null = null;
  /** null = not probed yet; false = the API has no sign-in (or is unreachable). */
  private available: boolean | null = null;
  private readonly listeners = new Set<AuthListener>();

  constructor(
    private readonly baseUrl = '',
    private readonly fetchImpl: Fetch = (...args) => fetch(...args)
  ) {}

  isConfigured(): boolean {
    // Until the first probe answers we assume yes, so the account card does not flicker.
    return this.available !== false;
  }

  getAuthState(): AuthState {
    return this.state;
  }

  /** The signed-in user with role, or null. */
  currentUser(): ApiUser | null {
    return this.me;
  }

  onAuthChange(listener: AuthListener): () => void {
    this.listeners.add(listener);
    void this.refresh();
    return () => this.listeners.delete(listener);
  }

  /** Asks the API who is signed in (after the magic link, on start, after sign-out). */
  async refresh(): Promise<AuthState> {
    let response: Response;
    try {
      response = await this.request('/api/v1/me');
    } catch (cause) {
      // Offline: keep the last known state; sync simply waits for the network.
      log.info('API unreachable, keeping the last auth state', {
        message: String(cause),
      });
      return this.state;
    }
    const isJson = response.headers.get('content-type')?.includes('application/json');
    // 404, a gateway error or an HTML page (SPA fallback, dev server): no sign-in here.
    if (response.status === 404 || response.status >= 502 || !isJson) {
      this.available = false;
      this.setUser(null);
    } else if (response.ok) {
      this.available = true;
      const user = (await response.json()) as ApiUser;
      this.setUser(user);
      // Rewards are counted per day in the account's zone (on the server too): until the
      // learner picks one, the device's zone is the best guess.
      const deviceZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (!user.timeZone && deviceZone) void this.setTimeZone(deviceZone);
    } else {
      this.available = true;
      this.setUser(null);
    }
    return this.state;
  }

  /**
   * Mails a sign-in link. `returnTo` is the in-app path the link leads back to (e.g. an
   * invite page); the server only accepts paths inside the app.
   */
  async signInWithEmail(
    email: string,
    returnTo: string = SIGN_IN_RETURN_PATH
  ): Promise<Result<void>> {
    const trimmed = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      return fail('invalid-email', 'Ungültige E-Mail-Adresse.');
    }
    let response: Response;
    try {
      response = await this.request('/api/v1/auth/sign-in/magic-link', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: trimmed, callbackURL: returnTo }),
      });
    } catch {
      return fail('offline', 'Keine Verbindung – versuch es gleich noch einmal.');
    }
    if (response.ok) return { ok: true, value: undefined };
    if (response.status === 429) {
      return fail(
        'rate-limited',
        'Zu viele Anfragen – bitte in ein paar Minuten noch einmal.'
      );
    }
    if (response.status === 404) {
      this.available = false;
      return fail(
        'unavailable',
        'Die Anmeldung ist auf diesem Server noch nicht eingerichtet.'
      );
    }
    log.warn('sign-in request failed', { status: response.status });
    return fail('auth-failed', 'Der Anmeldelink konnte nicht gesendet werden.');
  }

  async signOut(): Promise<Result<void>> {
    try {
      const response = await this.request('/api/v1/auth/sign-out', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      });
      if (!response.ok) return fail('signout-failed', 'Abmelden hat nicht geklappt.');
    } catch {
      return fail('offline', 'Keine Verbindung – Abmelden geht nur online.');
    }
    this.setUser(null);
    return { ok: true, value: undefined };
  }

  async push(table: SyncTable, records: SyncableRecord[]): Promise<Result<void>> {
    for (let i = 0; i < records.length; i += PUSH_BATCH) {
      const batch = records.slice(i, i + PUSH_BATCH);
      const result = await this.send<unknown>(`/api/v1/sync/${table}/push`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ records: batch }),
      });
      if (!result.ok) return result;
    }
    return { ok: true, value: undefined };
  }

  async pull(table: SyncTable, since: string | null): Promise<Result<PullResult>> {
    const all: SyncableRecord[] = [];
    let watermark: string | null = null;
    let cursor: PullPage['next'] = since ? { since, afterId: '' } : null;
    // Keyset pagination: follow `next` until the API says this was the last page.
    for (;;) {
      const query = new URLSearchParams();
      if (cursor?.since) query.set('since', cursor.since);
      if (cursor?.afterId) query.set('afterId', cursor.afterId);
      const suffix = query.size > 0 ? `?${query}` : '';
      const page = await this.send<PullPage>(`/api/v1/sync/${table}/pull${suffix}`);
      if (!page.ok) return page;
      all.push(...page.value.records);
      watermark = page.value.watermark ?? watermark;
      if (!page.value.next) return { ok: true, value: { records: all, watermark } };
      cursor = page.value.next;
    }
  }

  /** The signed-in devices of this account. */
  async listSessions(): Promise<Result<DeviceSession[]>> {
    const result = await this.send<{ sessions: DeviceSession[] }>(
      '/api/v1/account/sessions'
    );
    return result.ok ? { ok: true, value: result.value.sessions } : result;
  }

  /** Signs out one other device. */
  async revokeSession(id: string): Promise<Result<void>> {
    return this.send<void>(`/api/v1/account/sessions/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  }

  /** Signs out every device except this one; returns how many were signed out. */
  async revokeOtherSessions(): Promise<Result<number>> {
    const result = await this.send<{ revoked: number }>(
      '/api/v1/account/sessions/revoke-others',
      { method: 'POST' }
    );
    return result.ok ? { ok: true, value: result.value.revoked } : result;
  }

  /** XP, streak and badges as the server computed them from the synced data (story 5.4). */
  async engagementState(): Promise<Result<ServerEngagement | null>> {
    const result = await this.send<{ state: ServerEngagement | null }>(
      '/api/v1/engagement'
    );
    return result.ok ? { ok: true, value: result.value.state } : result;
  }

  /** Stores the account's time zone (IANA name, e.g. "Europe/Zurich"). */
  async setTimeZone(timeZone: string): Promise<Result<void>> {
    const result = await this.send<void>('/api/v1/account/settings', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ timeZone }),
    });
    if (result.ok && this.me) this.me = { ...this.me, timeZone };
    return result;
  }

  private async send<T>(path: string, init?: RequestInit): Promise<Result<T>> {
    let response: Response;
    try {
      response = await this.request(path, init);
    } catch (cause) {
      return fail('offline', cause instanceof Error ? cause.message : 'network error');
    }
    if (response.status === 401) {
      // The session ended (expired or signed out elsewhere).
      this.setUser(null);
      return fail('not-authenticated', 'Nicht angemeldet.');
    }
    if (!response.ok) {
      log.warn('sync request failed', { path, status: response.status });
      return fail(`http-${response.status}`, `Serverfehler (${response.status}).`);
    }
    // 204 No Content (settings, revoke) has no body to parse.
    if (response.status === 204) return { ok: true, value: undefined as T };
    return { ok: true, value: (await response.json()) as T };
  }

  private request(path: string, init: RequestInit = {}): Promise<Response> {
    return this.fetchImpl(`${this.baseUrl}${path}`, {
      ...init,
      credentials: 'same-origin',
    });
  }

  private setUser(user: ApiUser | null): void {
    const changed = (this.me?.id ?? null) !== (user?.id ?? null);
    this.me = user;
    this.state = user
      ? { status: 'signed-in', user: { id: user.id, email: user.email } }
      : SIGNED_OUT;
    if (changed || this.available !== null) {
      for (const listener of this.listeners) listener(this.state);
    }
  }
}

function fail<T>(code: string, message: string): Result<T> {
  return { ok: false, error: { code, message } };
}
