/** Client for class recordings (Sprint 7). */
import { apiRequest, type Fetch } from '@/services/api/request';

export type MediaStatus = 'uploading' | 'importing' | 'processing' | 'ready' | 'failed';

export interface MediaItem {
  id: string;
  title: string;
  source: 'upload' | 'drive';
  status: MediaStatus;
  progress: number;
  durationSec: number | null;
  hasVideo: boolean | null;
  originalName: string | null;
  originalSize: number;
  error: string | null;
  publishedAt: string | null;
  createdAt: string;
}

export interface UploadPlan {
  item: MediaItem;
  partSize: number;
  partCount: number;
}

export interface Playback extends MediaItem {
  audio: string;
  video: string | null;
}

export interface RecordingListening {
  mediaId: string;
  title: string;
  publishedAt: string;
  /** Active learners of the class. */
  learners: number;
  started: number;
  finished: number;
  people: { userId: string; name: string; percent: number; completedAt: string | null }[];
}

export class MediaApi {
  constructor(private readonly fetchImpl: Fetch = (...args) => fetch(...args)) {}

  /** Who listened to the class's published recordings (teachers of the class). */
  listening(classId: string) {
    return this.call<{ recordings: RecordingListening[] }>(
      `/api/v1/classes/${encodeURIComponent(classId)}/listening`
    );
  }

  list(classId: string) {
    return this.call<{ items: MediaItem[] }>(this.base(classId));
  }

  start(
    classId: string,
    file: { title: string; fileName: string; size: number; contentType: string }
  ) {
    return this.call<UploadPlan>(this.base(classId), {
      method: 'POST',
      body: JSON.stringify(file),
    });
  }

  partUrls(classId: string, mediaId: string, partNumbers: number[]) {
    return this.call<{ urls: Record<string, string> }>(
      `${this.base(classId)}/${encodeURIComponent(mediaId)}/parts`,
      { method: 'POST', body: JSON.stringify({ partNumbers }) }
    );
  }

  uploadedParts(classId: string, mediaId: string) {
    return this.call<{ parts: number[] }>(
      `${this.base(classId)}/${encodeURIComponent(mediaId)}/parts`
    );
  }

  complete(classId: string, mediaId: string) {
    return this.call<void>(
      `${this.base(classId)}/${encodeURIComponent(mediaId)}/complete`,
      {
        method: 'POST',
      }
    );
  }

  publish(classId: string, mediaId: string) {
    return this.call<void>(
      `${this.base(classId)}/${encodeURIComponent(mediaId)}/publish`,
      {
        method: 'POST',
        body: JSON.stringify({ consent: true }),
      }
    );
  }

  /** A new title for a recording (teacher). */
  rename(classId: string, mediaId: string, title: string) {
    return this.call<void>(`${this.base(classId)}/${encodeURIComponent(mediaId)}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title }),
    });
  }

  remove(classId: string, mediaId: string) {
    return this.call<void>(`${this.base(classId)}/${encodeURIComponent(mediaId)}`, {
      method: 'DELETE',
    });
  }

  play(classId: string, mediaId: string) {
    return this.call<Playback>(
      `${this.base(classId)}/${encodeURIComponent(mediaId)}/play`
    );
  }

  private base(classId: string) {
    return `/api/v1/classes/${encodeURIComponent(classId)}/media`;
  }

  private call<T>(path: string, init: RequestInit = {}) {
    return apiRequest<T>(this.fetchImpl, path, init, 'media');
  }
}
