/** Client for the video lessons (Sprint 12): the public catalog and the admin's tools. */
import { apiRequest, type Fetch } from '@/services/api/request';
import type { Checkpoint, CheckpointData, Cue } from '@/services/media/checkpoints';

export type PermissionStatus = 'unknown' | 'requested' | 'granted' | 'declined';

export interface VideoLesson {
  id: string;
  youtubeId: string;
  title: string;
  durationSec: number | null;
  thumbnailUrl: string | null;
  unit: number | null;
  channel: { name: string };
  /** The creator allowed transcripts and exercises. */
  interactive: boolean;
}

export interface VideoChannel {
  id: string;
  name: string;
  youtubeChannelId: string | null;
  playlists: string[];
  permissionStatus: PermissionStatus;
  permissionNotes: string;
  contactedAt: string | null;
  lastImportAt: string | null;
  lastImportError: string | null;
  videoCount: number;
}

export interface AdminVideo {
  id: string;
  channelId: string;
  youtubeId: string;
  title: string;
  durationSec: number | null;
  unit: number | null;
  hidden: boolean;
}

export const PERMISSION_LABELS: Record<PermissionStatus, string> = {
  unknown: 'Noch nicht angefragt',
  requested: 'Angefragt',
  granted: 'Erlaubt',
  declined: 'Abgelehnt',
};

const MESSAGES: Record<string, string> = {
  import_unavailable:
    'Für den Import fehlt der YouTube-Schlüssel (SUFFA_YOUTUBE_API_KEY).',
  invalid_body: 'Bitte prüfe die Eingaben (Playlist-IDs beginnen mit PL…).',
  second_factor_required: 'Bitte bestätige zuerst den Code aus deiner Authenticator-App.',
};

export class VideosApi {
  constructor(private readonly fetchImpl: Fetch = (...args) => fetch(...args)) {}

  list(unit?: number) {
    return this.call<{ videos: VideoLesson[] }>(
      `/api/v1/videos${unit ? `?unit=${unit}` : ''}`
    );
  }

  get(id: string) {
    return this.call<{
      video: VideoLesson;
      checkpoints: Checkpoint[];
      transcript: Cue[];
    }>(`/api/v1/videos/${encodeURIComponent(id)}`);
  }

  adminOverview() {
    return this.call<{
      channels: VideoChannel[];
      videos: AdminVideo[];
      importEnabled: boolean;
    }>('/api/v1/admin/videos');
  }

  createChannel(input: { name: string; playlists: string[] }) {
    return this.call<{ id: string }>('/api/v1/admin/videos/channels', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }

  updateChannel(
    id: string,
    patch: Partial<{
      name: string;
      playlists: string[];
      permissionStatus: PermissionStatus;
      permissionNotes: string;
      contactedAt: string | null;
    }>
  ) {
    return this.call<void>(`/api/v1/admin/videos/channels/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    });
  }

  importChannel(id: string) {
    return this.call<void>(
      `/api/v1/admin/videos/channels/${encodeURIComponent(id)}/import`,
      {
        method: 'POST',
      }
    );
  }

  updateVideo(id: string, patch: { unit?: number | null; hidden?: boolean }) {
    return this.call<void>(`/api/v1/admin/videos/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    });
  }

  saveTranscript(id: string, cues: Cue[]) {
    return this.call<void>(`/api/v1/admin/videos/${encodeURIComponent(id)}/transcript`, {
      method: 'PUT',
      body: JSON.stringify({ cues }),
    });
  }

  addCheckpoint(id: string, atSec: number, data: CheckpointData) {
    return this.call<Checkpoint>(
      `/api/v1/admin/videos/${encodeURIComponent(id)}/checkpoints`,
      {
        method: 'POST',
        body: JSON.stringify({ atSec, data }),
      }
    );
  }

  removeCheckpoint(id: string, checkpointId: string) {
    return this.call<void>(
      `/api/v1/admin/videos/${encodeURIComponent(id)}/checkpoints/${encodeURIComponent(checkpointId)}`,
      { method: 'DELETE' }
    );
  }

  private call<T>(path: string, init: RequestInit = {}) {
    return apiRequest<T>(this.fetchImpl, path, init, MESSAGES);
  }
}
