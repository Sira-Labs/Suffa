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

/** Class dashboard (story 6.1): aggregates of the active learners, last 7 days. */
export interface StudentProgress {
  userId: string;
  name: string | null;
  email: string | null;
  lastActiveAt: string | null;
  streak: number;
  totalXp: number;
  xpWeek: number;
  questsWeek: number;
  activeDaysWeek: number;
  matureWords: number;
  currentUnit: number | null;
}

export interface ClassProgress {
  since: string;
  students: StudentProgress[];
  matureByRef: Record<string, number>;
  leeches: { contentRef: string; learners: number }[];
}

export type ChallengeTemplate = 'reviews' | 'quests' | 'xp' | 'active-days';

export interface Challenge {
  id: string;
  template: ChallengeTemplate;
  target: number;
  weekStart: string;
  progress: number;
  reached: boolean;
  contributors: number;
  yours: number | null;
}

export const BADGE_ICONS = [
  'award',
  'flame',
  'read',
  'write',
  'speak',
  'listen',
  'roots',
  'check',
] as const;
export type BadgeIcon = (typeof BADGE_ICONS)[number];

export interface TeacherBadge {
  id: string;
  name: string;
  icon: BadgeIcon;
  message: string;
  awards: { userId: string; name: string | null; you: boolean; awardedAt: string }[];
}

export interface Shoutout {
  id: string;
  message: string;
  author: string | null;
  to: string | null;
  toYou: boolean;
  createdAt: string;
}

export interface ClassFeed {
  challenge: Challenge | null;
  shoutouts: Shoutout[];
  badges: TeacherBadge[];
}

/** Challenge templates in words (German). */
export const CHALLENGE_LABELS: Record<
  ChallengeTemplate,
  { title: string; unit: string; suggested: number }
> = {
  reviews: { title: 'Karten wiederholen', unit: 'Karten', suggested: 1000 },
  quests: { title: 'Tagesaufgaben schaffen', unit: 'Aufgaben', suggested: 100 },
  xp: { title: 'XP sammeln', unit: 'XP', suggested: 3000 },
  'active-days': { title: 'Lerntage sammeln', unit: 'Lerntage', suggested: 60 },
};

const MESSAGES: Record<string, string> = {
  invalid_invite:
    'Dieser Einladungslink ist abgelaufen oder ungültig. Bitte frag nach einem neuen.',
  forbidden: 'Das darf nur die Lehrkraft dieser Klasse.',
  not_a_learner: 'Das geht nur für Lernende der Klasse.',
  not_eligible: 'Die Meisterschaft der Einheit liegt noch unter 90 %.',
  exists: 'Für diese Einheit gibt es schon ein Zertifikat.',
  unknown_unit: 'Diese Einheit gibt es nicht.',
};

/** The token of an invite URL `…/join/<token>`, or null. */
export function inviteToken(url: string): string | null {
  return /\/join\/([A-Za-z0-9_-]{20,64})$/.exec(url)?.[1] ?? null;
}

export interface Certificate {
  id: string;
  userId: string;
  learnerName: string | null;
  unit: number;
  unitTitle: string;
  mastery: number;
  className: string;
  teacherName: string | null;
  awardedAt: string;
}

export interface ClassCertificates {
  threshold: number;
  eligible: {
    userId: string;
    name: string | null;
    unit: number;
    unitTitle: string;
    mastery: number;
  }[];
  awarded: Certificate[];
}

export interface LeagueSettings {
  enabled: boolean;
  /** A class of under-18s: first names only, league off unless turned on deliberately. */
  minors: boolean;
}

export interface LeagueView extends LeagueSettings {
  /** The learner's own choice; null for teachers, who are not ranked. */
  optedIn: boolean | null;
  participants: number;
  podium: { place: number; title: string; name: string; percent: number; you: boolean }[];
  you: { percent: number; activeDays: number; goal: number; onPodium: boolean } | null;
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

  progress(classId: string) {
    return this.call<ClassProgress>(`${this.base(classId)}/progress`);
  }

  feed(classId: string) {
    return this.call<ClassFeed>(`${this.base(classId)}/feed`);
  }

  setChallenge(
    classId: string,
    challenge: { template: ChallengeTemplate; target: number; timeZone: string }
  ) {
    return this.call<Challenge>(`${this.base(classId)}/challenge`, {
      method: 'PUT',
      body: JSON.stringify(challenge),
    });
  }

  removeChallenge(classId: string) {
    return this.call<void>(`${this.base(classId)}/challenge`, { method: 'DELETE' });
  }

  createBadge(
    classId: string,
    badge: { name: string; icon: BadgeIcon; message: string }
  ) {
    return this.call<TeacherBadge>(`${this.base(classId)}/badges`, {
      method: 'POST',
      body: JSON.stringify(badge),
    });
  }

  award(classId: string, badgeId: string, userId: string) {
    return this.call<void>(
      `${this.base(classId)}/badges/${encodeURIComponent(badgeId)}/awards`,
      { method: 'POST', body: JSON.stringify({ userId }) }
    );
  }

  shoutout(classId: string, message: string, userId: string | null) {
    return this.call<Shoutout>(`${this.base(classId)}/shoutouts`, {
      method: 'POST',
      body: JSON.stringify({ message, userId }),
    });
  }

  removeShoutout(classId: string, shoutoutId: string) {
    return this.call<void>(
      `${this.base(classId)}/shoutouts/${encodeURIComponent(shoutoutId)}`,
      { method: 'DELETE' }
    );
  }

  /** Unit certificates (story 14.3): eligible learners and those awarded. */
  certificates(classId: string) {
    return this.call<ClassCertificates>(`${this.base(classId)}/certificates`);
  }

  awardCertificate(classId: string, userId: string, unit: number) {
    return this.call<Certificate>(`${this.base(classId)}/certificates`, {
      method: 'POST',
      body: JSON.stringify({ userId, unit }),
    });
  }

  revokeCertificate(classId: string, certificateId: string) {
    return this.call<void>(
      `${this.base(classId)}/certificates/${encodeURIComponent(certificateId)}`,
      { method: 'DELETE' }
    );
  }

  /** The signed-in learner's own certificates. */
  myCertificates() {
    return this.call<{ certificates: Certificate[] }>('/api/v1/certificates');
  }

  /** The weekly league (story 14.2). */
  league(classId: string) {
    return this.call<LeagueView>(`${this.base(classId)}/league`);
  }

  setLeagueOptIn(classId: string, optIn: boolean) {
    return this.call<void>(`${this.base(classId)}/league/opt-in`, {
      method: 'PUT',
      body: JSON.stringify({ optIn }),
    });
  }

  leagueSettings(classId: string) {
    return this.call<LeagueSettings>(`${this.base(classId)}/league/settings`);
  }

  saveLeagueSettings(classId: string, settings: LeagueSettings) {
    return this.call<void>(`${this.base(classId)}/league/settings`, {
      method: 'PUT',
      body: JSON.stringify(settings),
    });
  }

  private base(classId: string) {
    return `/api/v1/classes/${encodeURIComponent(classId)}`;
  }

  private call<T>(path: string, init: RequestInit = {}) {
    return apiRequest<T>(this.fetchImpl, path, init, MESSAGES);
  }
}
