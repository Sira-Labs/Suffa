/**
 * Client for the admin area and the second factor (story 4.2). Same origin, session cookie;
 * errors come back as German messages the page can show as they are.
 */
export type Role = 'student' | 'teacher' | 'admin';

export interface AdminUser {
  id: string;
  email: string | null;
  name: string | null;
  role: Role;
  emailVerified: boolean;
  disabled: boolean;
  createdAt: string;
}

export interface AuditEntry {
  id: string;
  actorId: string | null;
  actorEmail: string | null;
  action: string;
  targetType: string;
  targetId: string;
  details: Record<string, unknown>;
  createdAt: string;
}

export type ApiResult<T> =
  | { ok: true; value: T }
  | { ok: false; status: number; message: string };

const MESSAGES: Record<string, string> = {
  second_factor_required: 'Bitte bestätige zuerst den Code aus deiner Authenticator-App.',
  invalid_code: 'Der Code stimmt nicht. Nimm den aktuellen Code aus der App.',
  locked: 'Zu viele falsche Codes – bitte in 15 Minuten noch einmal.',
  not_set_up: 'Die Zwei-Faktor-Anmeldung ist noch nicht eingerichtet.',
  already_enabled: 'Die Zwei-Faktor-Anmeldung ist schon eingerichtet.',
  cannot_change_self: 'Das eigene Konto kann hier nicht geändert werden.',
  forbidden: 'Dafür fehlt die Berechtigung.',
  unauthorized: 'Bitte melde dich erneut an.',
  not_found: 'Nicht gefunden.',
};

type Fetch = typeof fetch;

export class AdminApi {
  constructor(private readonly fetchImpl: Fetch = (...args) => fetch(...args)) {}

  twoFactorStatus() {
    return this.call<{ enabled: boolean; confirmed: boolean }>('/api/v1/account/2fa');
  }

  twoFactorSetup() {
    return this.call<{ uri: string; secret: string }>('/api/v1/account/2fa/setup', {
      method: 'POST',
    });
  }

  twoFactorConfirm(code: string) {
    return this.call<void>('/api/v1/account/2fa/confirm', {
      method: 'POST',
      body: JSON.stringify({ code }),
    });
  }

  listUsers(query: { search?: string; cursor?: string | null }) {
    const params = new URLSearchParams();
    if (query.search) params.set('q', query.search);
    if (query.cursor) params.set('cursor', query.cursor);
    return this.call<{ users: AdminUser[]; next: string | null }>(
      `/api/v1/admin/users${params.size ? `?${params}` : ''}`
    );
  }

  updateUser(id: string, change: { role?: Role; disabled?: boolean }) {
    return this.call<AdminUser>(`/api/v1/admin/users/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(change),
    });
  }

  listAudit(before?: string | null) {
    return this.call<{ entries: AuditEntry[]; next: string | null }>(
      `/api/v1/admin/audit${before ? `?before=${encodeURIComponent(before)}` : ''}`
    );
  }

  private async call<T>(path: string, init: RequestInit = {}): Promise<ApiResult<T>> {
    let response: Response;
    try {
      response = await this.fetchImpl(path, {
        ...init,
        credentials: 'same-origin',
        headers: init.body ? { 'content-type': 'application/json' } : undefined,
      });
    } catch {
      return { ok: false, status: 0, message: 'Keine Verbindung.' };
    }
    if (response.status === 204) return { ok: true, value: undefined as T };
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    if (!response.ok) {
      const code = body?.error ?? '';
      return {
        ok: false,
        status: response.status,
        message: MESSAGES[code] ?? `Serverfehler (${response.status}).`,
      };
    }
    return { ok: true, value: body as T };
  }
}

/** Audit actions in words. */
export function describeAudit(entry: AuditEntry): string {
  const d = entry.details;
  switch (entry.action) {
    case 'user.role_changed':
      return `Rolle geändert: ${roleLabel(d.from)} → ${roleLabel(d.to)}`;
    case 'user.disabled':
      return `Konto gesperrt${typeof d.endedSessions === 'number' ? ` (${d.endedSessions} Sitzung(en) beendet)` : ''}`;
    case 'user.enabled':
      return 'Konto entsperrt';
    case 'account.2fa_enabled':
      return 'Zwei-Faktor-Anmeldung eingerichtet';
    default:
      return entry.action;
  }
}

export function roleLabel(role: unknown): string {
  return role === 'admin' ? 'Admin' : role === 'teacher' ? 'Lehrkraft' : 'Lernende:r';
}
