/**
 * Client for the admin area and the second factor (story 4.2). Same origin, session cookie;
 * errors come back as messages in the interface language the page can show as they are.
 */
import i18n from '@/i18n';
import { apiRequest, type Fetch } from '@/services/api/request';

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

/** API error codes in the interface language, read at call time (story 16.3). */
const messages = (): Record<string, string> => ({
  second_factor_required: i18n.t('admin:errors.secondFactorRequired'),
  invalid_code: i18n.t('admin:errors.invalidCode'),
  locked: i18n.t('admin:errors.locked'),
  not_set_up: i18n.t('admin:errors.notSetUp'),
  already_enabled: i18n.t('admin:errors.alreadyEnabled'),
  cannot_change_self: i18n.t('admin:errors.cannotChangeSelf'),
});

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

  private call<T>(path: string, init: RequestInit = {}) {
    return apiRequest<T>(this.fetchImpl, path, init, messages());
  }
}

/** Audit actions in words, in the interface language. Values from the details stay as sent. */
export function describeAudit(entry: AuditEntry): string {
  const d = entry.details;
  switch (entry.action) {
    case 'user.role_changed':
      return i18n.t('admin:audit.roleChanged', {
        from: roleLabel(d.from),
        to: roleLabel(d.to),
      });
    case 'user.disabled':
      return typeof d.endedSessions === 'number'
        ? i18n.t('admin:audit.disabledSessions', { count: d.endedSessions })
        : i18n.t('admin:audit.disabled');
    case 'user.enabled':
      return i18n.t('admin:audit.enabled');
    case 'account.2fa_enabled':
      return i18n.t('admin:audit.twoFactorEnabled');
    case 'ai.routes.replace':
      return i18n.t('admin:audit.aiRoutes', { task: entry.targetId });
    case 'ai.settings.update':
      return i18n.t('admin:audit.aiSettings');
    case 'video.channel_created':
      return i18n.t('admin:audit.channelCreated', { name: String(d.name ?? '') });
    case 'video.permission_changed':
      return i18n.t('admin:audit.permissionChanged', {
        from: String(d.from ?? ''),
        to: String(d.permissionStatus ?? ''),
      });
    case 'video.channel_updated':
      return i18n.t('admin:audit.channelUpdated');
    case 'certificate.awarded':
      return i18n.t('admin:audit.certificateAwarded', {
        unit: String(d.unit ?? ''),
        mastery: String(d.mastery ?? ''),
      });
    case 'certificate.revoked':
      return i18n.t('admin:audit.certificateRevoked', { unit: String(d.unit ?? '') });
    case 'content.units_seeded':
      return i18n.t('admin:audit.unitsSeeded', {
        count: Array.isArray(d.units) ? d.units.length : 0,
      });
    case 'content.unit_saved': {
      const c = (d.counts ?? {}) as {
        added?: number;
        removed?: number;
        changed?: number;
      };
      return i18n.t('admin:audit.unitSaved', {
        added: c.added ?? 0,
        changed: c.changed ?? 0,
        removed: c.removed ?? 0,
      });
    }
    case 'content.unit_submitted':
      return i18n.t('admin:audit.unitSubmitted');
    case 'content.unit_checked':
      return i18n.t('admin:audit.unitChecked');
    case 'content.unit_returned':
      return i18n.t('admin:audit.unitReturned', { note: String(d.note ?? '') });
    case 'content.unit_published':
      return i18n.t('admin:audit.unitPublished');
    case 'class.league.settings':
      return (
        i18n.t(d.enabled ? 'admin:audit.leagueOn' : 'admin:audit.leagueOff') +
        (d.minors ? i18n.t('admin:audit.leagueMinors') : '')
      );
    default:
      return entry.action;
  }
}

export function roleLabel(role: unknown): string {
  return role === 'admin'
    ? i18n.t('admin:roles.admin')
    : role === 'teacher'
      ? i18n.t('admin:roles.teacher')
      : i18n.t('admin:roles.student');
}
