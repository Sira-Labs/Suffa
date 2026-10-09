/**
 * Sharing one's own recordings with the class teacher (story 15.4): opt-in per recording,
 * only that class's teachers hear it, the learner withdraws it at any time.
 */
import { apiRequest, type ApiResult, type Fetch } from '@/services/api/request';
import type { Recording } from '@/services/audio';

export interface ShareTarget {
  classId: string;
  name: string;
  /** False in a class of minors until the teacher recorded the parents' consent. */
  allowed: boolean;
}

export interface SharedRecording {
  id: string;
  classId: string;
  className: string;
  text: string;
  /** Pronunciation score (0–1) when the learner had it rated before sharing. */
  score: number | null;
  comment: string | null;
  commentedAt: string | null;
  heardAt: string | null;
  createdAt: string;
  /** Short-lived URL to play it. */
  url: string;
}

export interface ClassSharedRecording extends SharedRecording {
  learner: { id: string; name: string | null; email: string | null };
}

const MESSAGES: Record<string, string> = {
  not_member: 'Du bist (noch) nicht Mitglied dieser Klasse.',
  consent_needed:
    'In dieser Klasse braucht es zuerst das Einverständnis deiner Eltern. Die Lehrkraft trägt es ein.',
  too_many:
    'Du hast schon sehr viele Aufnahmen geteilt. Zieh ältere zurück, um neue zu teilen.',
  rate_limited: 'Gerade viele Aufnahmen auf einmal – bitte einen Moment warten.',
  unsupported_audio: 'Dieses Aufnahmeformat kann der Server nicht speichern.',
  audio_too_short: 'Die Aufnahme ist zu kurz.',
  payload_too_large: 'Die Aufnahme ist zu lang. Nimm nur diesen Satz auf.',
};

export class SharingApi {
  constructor(private readonly fetchImpl: Fetch = (...args) => fetch(...args)) {}

  mine(): Promise<ApiResult<{ targets: ShareTarget[]; items: SharedRecording[] }>> {
    return apiRequest(this.fetchImpl, '/api/v1/me/shared-recordings', {}, MESSAGES);
  }

  share(input: {
    classId: string;
    text: string;
    recording: Recording;
    score?: number | null;
  }): Promise<ApiResult<{ id: string }>> {
    const form = new FormData();
    form.set('classId', input.classId);
    form.set('text', input.text);
    form.set('audio', input.recording.blob);
    if (input.score !== undefined && input.score !== null) {
      form.set('score', String(input.score));
    }
    return apiRequest(
      this.fetchImpl,
      '/api/v1/me/shared-recordings',
      { method: 'POST', body: form },
      MESSAGES
    );
  }

  withdraw(id: string): Promise<ApiResult<void>> {
    return apiRequest(
      this.fetchImpl,
      `/api/v1/me/shared-recordings/${encodeURIComponent(id)}`,
      { method: 'DELETE' },
      MESSAGES
    );
  }

  forClass(classId: string): Promise<ApiResult<{ items: ClassSharedRecording[] }>> {
    return apiRequest(
      this.fetchImpl,
      `/api/v1/classes/${encodeURIComponent(classId)}/shared-recordings`,
      {},
      MESSAGES
    );
  }

  review(
    classId: string,
    id: string,
    change: { comment?: string | null; heard?: boolean }
  ): Promise<ApiResult<void>> {
    return apiRequest(
      this.fetchImpl,
      `/api/v1/classes/${encodeURIComponent(classId)}/shared-recordings/${encodeURIComponent(id)}`,
      { method: 'PATCH', body: JSON.stringify(change) },
      MESSAGES
    );
  }

  setConsent(
    classId: string,
    userId: string,
    consent: boolean
  ): Promise<ApiResult<void>> {
    return apiRequest(
      this.fetchImpl,
      `/api/v1/classes/${encodeURIComponent(classId)}/members/${encodeURIComponent(userId)}/consent`,
      { method: 'PUT', body: JSON.stringify({ consent }) },
      MESSAGES
    );
  }
}
