/**
 * Live lessons (ADR-0026): planning, starting and joining a class's live sessions, and the
 * teacher giving learners the floor. The room itself is in liveRoom.ts.
 */
import { apiRequest, type Fetch } from '@/services/api/request';

export type LiveStatus = 'scheduled' | 'live' | 'ended';
export type LiveRole = 'teacher' | 'learner';
/** Who a session is for: the whole class, or the sisters or the brothers only. */
export type LiveAudience = 'all' | 'sisters' | 'brothers';

export interface LiveSession {
  id: string;
  classId: string;
  title: string;
  startsAt: string;
  durationMinutes: number;
  status: LiveStatus;
  startedAt: string | null;
  endedAt: string | null;
  audience: LiveAudience;
  /** Learners given the floor may turn on their camera; false: their voice only. */
  learnerCameras: boolean;
  /** The session is being recorded right now (ADR-0029). */
  recording: boolean;
}

export interface LiveSessions {
  /** False while the server has no LiveKit set up. */
  enabled: boolean;
  /** The teacher can record sessions on the server (ADR-0029). */
  recordingEnabled: boolean;
  sessions: LiveSession[];
}

export interface LiveJoin {
  url: string;
  token: string;
  role: LiveRole;
  session: LiveSession;
}

/** A link (with its QR code made in the browser) inviting to one session. */
export interface LiveInvite {
  url: string;
  expiresAt: string;
}

/** What an invite link shows before joining. */
export interface LiveInvitePreview {
  classId: string;
  className: string;
  teacherName: string | null;
  sessionId: string;
  title: string;
  startsAt: string;
  status: 'scheduled' | 'live';
}

export interface LiveInviteJoin {
  classId: string;
  sessionId: string;
  /** `pending` until the teacher approves someone new to the class. */
  status: 'pending' | 'active';
}

export interface NewLiveSession {
  title: string;
  startsAt: string;
  durationMinutes: number;
  audience: LiveAudience;
  learnerCameras: boolean;
}

export class LiveApi {
  constructor(private readonly fetchImpl: Fetch = (...args) => fetch(...args)) {}

  list(classId: string) {
    return this.call<LiveSessions>(this.base(classId));
  }

  create(classId: string, session: NewLiveSession) {
    return this.call<{ session: LiveSession }>(this.base(classId), {
      method: 'POST',
      body: JSON.stringify(session),
    });
  }

  start(classId: string, sessionId: string) {
    return this.call<{ session: LiveSession }>(
      `${this.base(classId)}/${sessionId}/start`,
      {
        method: 'POST',
      }
    );
  }

  end(classId: string, sessionId: string) {
    return this.call<{ session: LiveSession }>(`${this.base(classId)}/${sessionId}/end`, {
      method: 'POST',
    });
  }

  cancel(classId: string, sessionId: string) {
    return this.call<void>(`${this.base(classId)}/${sessionId}`, { method: 'DELETE' });
  }

  join(classId: string, sessionId: string) {
    return this.call<LiveJoin>(`${this.base(classId)}/${sessionId}/join`, {
      method: 'POST',
    });
  }

  /**
   * Gives a learner in the room the floor (microphone, and the camera unless the session
   * keeps learner cameras off) or takes it back.
   */
  floor(classId: string, sessionId: string, identity: string, allowed: boolean) {
    return this.call<void>(`${this.base(classId)}/${sessionId}/floor`, {
      method: 'POST',
      body: JSON.stringify({ identity, allowed }),
    });
  }

  /** Starts recording the session into the class's recordings (ADR-0029). */
  startRecording(classId: string, sessionId: string) {
    return this.call<{ session: LiveSession }>(
      `${this.base(classId)}/${sessionId}/recording`,
      { method: 'POST' }
    );
  }

  stopRecording(classId: string, sessionId: string) {
    return this.call<{ session: LiveSession }>(
      `${this.base(classId)}/${sessionId}/recording`,
      { method: 'DELETE' }
    );
  }

  /** A new invite link to the session (the session's older link stops working). */
  invite(classId: string, sessionId: string) {
    return this.call<LiveInvite>(`${this.base(classId)}/${sessionId}/invite`, {
      method: 'POST',
    });
  }

  previewInvite(token: string) {
    return this.call<LiveInvitePreview>(
      `/api/v1/live-invites/${encodeURIComponent(token)}`
    );
  }

  joinInvite(token: string) {
    return this.call<LiveInviteJoin>(
      `/api/v1/live-invites/${encodeURIComponent(token)}/join`,
      { method: 'POST' }
    );
  }

  private base(classId: string) {
    return `/api/v1/classes/${encodeURIComponent(classId)}/live`;
  }

  private call<T>(path: string, init: RequestInit = {}) {
    return apiRequest<T>(this.fetchImpl, path, init, 'live');
  }
}
