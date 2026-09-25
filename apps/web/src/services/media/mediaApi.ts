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

const MESSAGES: Record<string, string> = {
  too_large: 'Die Datei ist zu groß (höchstens 10 GB).',
  quota_exceeded: 'Der Speicher dieser Klasse ist voll (50 GB). Lösche alte Aufnahmen.',
  unsupported_type:
    'Dieses Dateiformat wird nicht unterstützt (Audio oder Video, z. B. MP3, M4A, MP4).',
  parts_missing: 'Es fehlen noch Teile der Datei. Der Upload wird fortgesetzt.',
  consent_required: 'Bitte bestätige, dass alle Aufgenommenen einverstanden sind.',
};

export class MediaApi {
  constructor(private readonly fetchImpl: Fetch = (...args) => fetch(...args)) {}

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
    return apiRequest<T>(this.fetchImpl, path, init, MESSAGES);
  }
}
