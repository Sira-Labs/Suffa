/** Client for classes and invites (story 4.3). */
import { apiRequest, type Fetch } from '@/services/api/request';

export type ClassRole = 'teacher' | 'student';
export type MemberStatus = 'pending' | 'active';

export interface ClassSummary {
  id: string;
  name: string;
  classRole: ClassRole;
  status: MemberStatus;
  studentCount: number;
  pendingCount: number;
  createdAt: string;
}

export interface Member {
  userId: string;
  email: string | null;
  name: string | null;
  classRole: ClassRole;
  status: MemberStatus;
  joinedAt: string;
}

const MESSAGES: Record<string, string> = {
  invalid_invite:
    'Dieser Einladungslink ist abgelaufen oder ungültig. Bitte frag nach einem neuen.',
  forbidden: 'Das darf nur die Lehrkraft dieser Klasse.',
};

/** The token of an invite URL `…/join/<token>`, or null. */
export function inviteToken(url: string): string | null {
  return /\/join\/([A-Za-z0-9_-]{20,64})$/.exec(url)?.[1] ?? null;
}

export class ClassesApi {
  constructor(private readonly fetchImpl: Fetch = (...args) => fetch(...args)) {}

  list() {
    return this.call<{ classes: ClassSummary[] }>('/api/v1/classes');
  }

  create(name: string) {
    return this.call<ClassSummary>('/api/v1/classes', {
      method: 'POST',
      body: JSON.stringify({ name }),
    });
  }

  invite(classId: string) {
    return this.call<{ url: string; expiresAt: string }>(
      `/api/v1/classes/${encodeURIComponent(classId)}/invite`,
      { method: 'POST' }
    );
  }

  members(classId: string) {
    return this.call<{ members: Member[] }>(
      `/api/v1/classes/${encodeURIComponent(classId)}/members`
    );
  }

  approve(classId: string, userId: string) {
    return this.call<void>(
      `/api/v1/classes/${encodeURIComponent(classId)}/members/${encodeURIComponent(userId)}/approve`,
      { method: 'POST' }
    );
  }

  remove(classId: string, userId: string) {
    return this.call<void>(
      `/api/v1/classes/${encodeURIComponent(classId)}/members/${encodeURIComponent(userId)}`,
      { method: 'DELETE' }
    );
  }

  preview(token: string) {
    return this.call<{ className: string; teacherName: string | null }>(
      `/api/v1/invites/${encodeURIComponent(token)}`
    );
  }

  join(token: string) {
    return this.call<{ classId: string; className: string; status: MemberStatus }>(
      `/api/v1/invites/${encodeURIComponent(token)}/join`,
      { method: 'POST' }
    );
  }

  private call<T>(path: string, init: RequestInit = {}) {
    return apiRequest<T>(this.fetchImpl, path, init, MESSAGES);
  }
}
