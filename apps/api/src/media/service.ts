/**
 * Recordings (stories 7.3–7.5): a teacher uploads a session recording in parts straight to
 * object storage, the worker transcodes it, class members play it via presigned URLs.
 */
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Logger } from 'pino';
import {
  PART_SIZE,
  type ObjectStorage,
  type UploadPart,
} from '../storage/objectStorage.js';
import type { MediaItem, MediaRepository } from './repository.js';
import {
  probe as probeFile,
  transcode as transcodeFile,
  type Probe,
} from './transcode.js';

/** Largest recording accepted (a long lesson in HD). */
export const MAX_RECORDING_BYTES = 10 * 1024 ** 3;
/** Originals per class (ADR-0017: default 50 GB). */
export const CLASS_QUOTA_BYTES = 50 * 1024 ** 3;
/** Presigned play URLs outlive a long lesson (seeking reuses the URL). */
export const PLAY_URL_SECONDS = 6 * 60 * 60;
/** Part URLs handed out per request. */
export const MAX_PART_URLS = 100;

export type StartResult =
  | { ok: true; item: MediaItem; partSize: number; partCount: number }
  | { ok: false; reason: 'too_large' | 'quota_exceeded' | 'unsupported_type' };

export interface Media {
  start(
    classId: string,
    userId: string,
    file: { title: string; fileName: string; size: number; contentType: string }
  ): Promise<StartResult>;
  partUrls(item: MediaItem, partNumbers: number[]): Promise<Record<number, string>>;
  uploadedParts(item: MediaItem): Promise<UploadPart[]>;
  complete(item: MediaItem): Promise<boolean>;
  remove(item: MediaItem): Promise<void>;
  playUrls(item: MediaItem): Promise<{ audio: string; video: string | null }>;
}

const EXTENSIONS: Record<string, string> = {
  'audio/mpeg': '.mp3',
  'audio/mp4': '.m4a',
  'audio/x-m4a': '.m4a',
  'audio/aac': '.aac',
  'audio/wav': '.wav',
  'audio/x-wav': '.wav',
  'audio/ogg': '.ogg',
  'audio/webm': '.webm',
  'audio/flac': '.flac',
  'video/mp4': '.mp4',
  'video/quicktime': '.mov',
  'video/webm': '.webm',
  'video/x-matroska': '.mkv',
};

export function isSupportedType(contentType: string): boolean {
  return contentType in EXTENSIONS;
}

export function recordingKey(classId: string, mediaId: string, file: string): string {
  return `recordings/${classId}/${mediaId}/${file}`;
}

export class MediaService implements Media {
  constructor(
    private readonly repo: MediaRepository,
    private readonly storage: ObjectStorage,
    private readonly enqueue: (mediaId: string) => Promise<void>
  ) {}

  async start(
    classId: string,
    userId: string,
    file: { title: string; fileName: string; size: number; contentType: string }
  ): Promise<StartResult> {
    if (!isSupportedType(file.contentType))
      return { ok: false, reason: 'unsupported_type' };
    if (file.size > MAX_RECORDING_BYTES) return { ok: false, reason: 'too_large' };
    if ((await this.repo.classBytes(classId)) + file.size > CLASS_QUOTA_BYTES) {
      return { ok: false, reason: 'quota_exceeded' };
    }
    const id = randomUUID();
    const key = recordingKey(classId, id, `original${EXTENSIONS[file.contentType]}`);
    const uploadId = await this.storage.createMultipartUpload(
      'media',
      key,
      file.contentType
    );
    const item = await this.repo.create({
      id,
      classId,
      createdBy: userId,
      title: file.title,
      source: 'upload',
      status: 'uploading',
      originalKey: key,
      originalName: file.fileName,
      originalSize: file.size,
      contentType: file.contentType,
      uploadId,
      driveFileId: null,
    });
    return {
      ok: true,
      item,
      partSize: PART_SIZE,
      partCount: Math.max(1, Math.ceil(file.size / PART_SIZE)),
    };
  }

  async partUrls(item: MediaItem, partNumbers: number[]) {
    const urls: Record<number, string> = {};
    for (const n of partNumbers) {
      urls[n] = await this.storage.presignUploadPart(
        'media',
        item.originalKey,
        item.uploadId!,
        n
      );
    }
    return urls;
  }

  uploadedParts(item: MediaItem) {
    return this.storage.listParts('media', item.originalKey, item.uploadId!);
  }

  async complete(item: MediaItem) {
    const parts = await this.uploadedParts(item);
    const expected = Math.max(1, Math.ceil(item.originalSize / PART_SIZE));
    if (parts.length !== expected) return false;
    await this.storage.completeMultipartUpload(
      'media',
      item.originalKey,
      item.uploadId!,
      parts
    );
    await this.repo.update(item.id, {
      status: 'processing',
      uploadId: null,
      progress: 0,
    });
    await this.enqueue(item.id);
    return true;
  }

  async remove(item: MediaItem) {
    if (item.status === 'uploading' && item.uploadId) {
      await this.storage.abortMultipartUpload('media', item.originalKey, item.uploadId);
    } else {
      await this.storage.delete('media', item.originalKey);
    }
    for (const key of Object.values(item.renditions)) {
      if (key) await this.storage.delete('media', key);
    }
    await this.repo.remove(item.id);
  }

  async playUrls(item: MediaItem) {
    const { audio, video } = item.renditions;
    return {
      audio: await this.storage.presignGet('media', audio!, PLAY_URL_SECONDS),
      video: video
        ? await this.storage.presignGet('media', video, PLAY_URL_SECONDS)
        : null,
    };
  }
}

/** Tools the worker uses; injected so tests can run without ffmpeg. */
export interface Transcoder {
  probe(file: string): Promise<Probe>;
  transcode(
    input: string,
    outDir: string,
    info: Probe,
    onProgress: (percent: number) => void
  ): Promise<{ audio: string; video: string | null }>;
}

export const ffmpegTranscoder: Transcoder = {
  probe: probeFile,
  transcode: transcodeFile,
};

/**
 * Worker step (story 7.4): original → audio (+ 720p video) in storage, progress on the row.
 * Failures are stored on the item and rethrown so the queue retries.
 */
export async function processRecording(
  repo: MediaRepository,
  storage: ObjectStorage,
  transcoder: Transcoder,
  mediaId: string,
  log: Pick<Logger, 'info' | 'warn'>
): Promise<void> {
  const item = await repo.byId(mediaId);
  if (!item || item.status === 'ready') return;
  const dir = await mkdtemp(join(tmpdir(), 'suffa-media-'));
  try {
    const input = join(dir, 'original');
    await storage.download('media', item.originalKey, input);
    const info = await transcoder.probe(input);
    let last = -1;
    const out = await transcoder.transcode(input, dir, info, (percent) => {
      // Only every 5 % to keep writes low.
      if (percent - last >= 5 || percent === 100) {
        last = percent;
        void repo.update(item.id, { progress: percent });
      }
    });
    const audioKey = recordingKey(item.classId, item.id, 'audio.m4a');
    await storage.putFile('media', audioKey, out.audio, 'audio/mp4');
    let videoKey: string | undefined;
    if (out.video) {
      videoKey = recordingKey(item.classId, item.id, 'video.mp4');
      await storage.putFile('media', videoKey, out.video, 'video/mp4');
    }
    await repo.update(item.id, {
      status: 'ready',
      progress: 100,
      durationSec: info.durationSec,
      hasVideo: info.hasVideo,
      renditions: videoKey ? { audio: audioKey, video: videoKey } : { audio: audioKey },
      error: null,
    });
    log.info({ mediaId, durationSec: info.durationSec }, 'media.ready');
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 500) : String(error);
    await repo.update(item.id, { status: 'failed', error: message });
    log.warn({ mediaId, err: error }, 'media.failed');
    throw error;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
