/**
 * Live lessons (ADR-0026): planning, starting and joining a class's live sessions, and the
 * teacher giving learners the floor. The room itself is in liveRoom.ts.
 */
import { apiRequest, type Fetch } from '@/services/api/request';

export type LiveStatus = 'scheduled' | 'live' | 'ended';
export type LiveRole = 'teacher' | 'learner';

export interface LiveSession {
  id: string;
  classId: string;
  title: string;
  startsAt: string;
  durationMinutes: number;
  status: LiveStatus;
  startedAt: string | null;
  endedAt: string | null;
}

export interface LiveSessions {
  /** False while the server has no LiveKit set up. */
  enabled: boolean;
  sessions: LiveSession[];
}

export interface LiveJoin {
  url: string;
  token: string;
  role: LiveRole;
  session: LiveSession;
}

export interface NewLiveSession {
  title: string;
  startsAt: string;
  durationMinutes: number;
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

  /** Gives a learner in the room the floor (microphone and camera) or takes it back. */
  floor(classId: string, sessionId: string, identity: string, allowed: boolean) {
    return this.call<void>(`${this.base(classId)}/${sessionId}/floor`, {
      method: 'POST',
      body: JSON.stringify({ identity, allowed }),
    });
  }

  private base(classId: string) {
    return `/api/v1/classes/${encodeURIComponent(classId)}/live`;
  }

  private call<T>(path: string, init: RequestInit = {}) {
    return apiRequest<T>(this.fetchImpl, path, init, 'live');
  }
}
