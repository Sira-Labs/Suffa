/** Client for the video lessons (Sprint 12): the public catalog and the admin's tools. */
import type { CourseId } from '@suffa/engagement';
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
  /** `course`: the course the channel teaches (ADR-0025). */
  channel: { name: string; course?: CourseId };
  /** The creator allowed transcripts and exercises. */
  interactive: boolean;
}

export interface VideoChannel {
  id: string;
  name: string;
  /** The course its lessons belong to (ADR-0025). */
  course: CourseId;
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

  createChannel(input: { name: string; course: CourseId; playlists: string[] }) {
    return this.call<{ id: string }>('/api/v1/admin/videos/channels', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }

  updateChannel(
    id: string,
    patch: Partial<{
      name: string;
      course: CourseId;
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
    return apiRequest<T>(this.fetchImpl, path, init, 'videos');
  }
}
