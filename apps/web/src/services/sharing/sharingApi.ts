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

export class SharingApi {
  constructor(private readonly fetchImpl: Fetch = (...args) => fetch(...args)) {}

  mine(): Promise<ApiResult<{ targets: ShareTarget[]; items: SharedRecording[] }>> {
    return apiRequest(this.fetchImpl, '/api/v1/me/shared-recordings', {}, 'sharing');
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
      'sharing'
    );
  }

  withdraw(id: string): Promise<ApiResult<void>> {
    return apiRequest(
      this.fetchImpl,
      `/api/v1/me/shared-recordings/${encodeURIComponent(id)}`,
      { method: 'DELETE' },
      'sharing'
    );
  }

  forClass(classId: string): Promise<ApiResult<{ items: ClassSharedRecording[] }>> {
    return apiRequest(
      this.fetchImpl,
      `/api/v1/classes/${encodeURIComponent(classId)}/shared-recordings`,
      {},
      'sharing'
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
      'sharing'
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
      'sharing'
    );
  }
}
