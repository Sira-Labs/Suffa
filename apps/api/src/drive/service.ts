/**
 * Drive import (story 7.2): a teacher connects Google Drive once (refresh token sealed at
 * rest), picks recordings in the Google Picker, and the worker copies each picked file into
 * object storage before the usual transcoding.
 */
import { randomUUID } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type pg from 'pg';
import type { Logger } from 'pino';
import type { SecretBox } from '../security/secretBox.js';
import type { ObjectStorage } from '../storage/objectStorage.js';
import type { MediaRepository } from '../media/repository.js';
import {
  CLASS_QUOTA_BYTES,
  isSupportedType,
  MAX_RECORDING_BYTES,
  processRecording,
  recordingKey,
  type Transcoder,
} from '../media/service.js';
import { GoogleError, type GoogleClient } from './google.js';

export interface DriveConnections {
  save(userId: string, sealed: string): Promise<void>;
  sealedToken(userId: string): Promise<string | null>;
  remove(userId: string): Promise<boolean>;
}

export class PgDriveConnections implements DriveConnections {
  constructor(private readonly pool: pg.Pool) {}

  async save(userId: string, sealed: string) {
    await this.pool.query(
      `insert into drive_connections (user_id, refresh_token_sealed) values ($1, $2)
       on conflict (user_id) do update set refresh_token_sealed = excluded.refresh_token_sealed,
         connected_at = now()`,
      [userId, sealed]
    );
  }

  async sealedToken(userId: string) {
    const { rows } = await this.pool.query(
      'select refresh_token_sealed from drive_connections where user_id = $1',
      [userId]
    );
    return (rows[0]?.refresh_token_sealed as string | undefined) ?? null;
  }

  async remove(userId: string) {
    const { rowCount } = await this.pool.query(
      'delete from drive_connections where user_id = $1',
      [userId]
    );
    return (rowCount ?? 0) > 0;
  }
}

export type ImportResult =
  | { ok: true; ids: string[] }
  | {
      ok: false;
      reason:
        | 'not_connected'
        | 'unsupported_type'
        | 'too_large'
        | 'quota_exceeded'
        | 'not_accessible';
      /** For the log only: Google's status or the refused file type, never file names. */
      detail?: { googleStatus?: number; mimeType?: string };
    };

export class DriveService {
  constructor(
    private readonly google: GoogleClient,
    private readonly connections: DriveConnections,
    private readonly box: SecretBox,
    private readonly media: MediaRepository,
    private readonly enqueueImport: (mediaId: string) => Promise<void>
  ) {}

  async connect(userId: string, code: string) {
    const { refreshToken } = await this.google.exchangeCode(code);
    await this.connections.save(userId, this.box.seal(refreshToken));
  }

  async connected(userId: string) {
    return (await this.connections.sealedToken(userId)) !== null;
  }

  /** A short-lived access token for the Picker in the teacher's browser. */
  async accessToken(userId: string): Promise<string | null> {
    const sealed = await this.connections.sealedToken(userId);
    return sealed ? this.google.accessToken(this.box.open(sealed)) : null;
  }

  async disconnect(userId: string) {
    const sealed = await this.connections.sealedToken(userId);
    if (sealed) await this.google.revoke(this.box.open(sealed)).catch(() => undefined);
    return this.connections.remove(userId);
  }

  /** Checks the picked files and queues their import. */
  async import(
    classId: string,
    userId: string,
    fileIds: string[]
  ): Promise<ImportResult> {
    const token = await this.accessToken(userId);
    if (!token) return { ok: false, reason: 'not_connected' };
    const files = [];
    for (const id of fileIds) {
      try {
        files.push(await this.google.file(token, id));
      } catch (error) {
        if (error instanceof GoogleError) {
          return {
            ok: false,
            reason: 'not_accessible',
            detail: { googleStatus: error.status },
          };
        }
        throw error;
      }
    }
    const unsupported = files.find((f) => !isSupportedType(f.mimeType));
    if (unsupported) {
      return {
        ok: false,
        reason: 'unsupported_type',
        detail: { mimeType: unsupported.mimeType },
      };
    }
    if (files.some((f) => f.size > MAX_RECORDING_BYTES))
      return { ok: false, reason: 'too_large' };
    const total = files.reduce((sum, f) => sum + f.size, 0);
    if ((await this.media.classBytes(classId)) + total > CLASS_QUOTA_BYTES) {
      return { ok: false, reason: 'quota_exceeded' };
    }
    const ids: string[] = [];
    for (const f of files) {
      const id = randomUUID();
      await this.media.create({
        id,
        classId,
        createdBy: userId,
        title: f.name.replace(/\.[^.]+$/, '').slice(0, 120) || 'Aufnahme',
        source: 'drive',
        status: 'importing',
        originalKey: recordingKey(classId, id, 'original'),
        originalName: f.name.slice(0, 255),
        originalSize: f.size,
        contentType: f.mimeType,
        uploadId: null,
        driveFileId: f.id,
      });
      await this.enqueueImport(id);
      ids.push(id);
    }
    return { ok: true, ids };
  }
}

/** Worker step: Drive → object storage → transcode (one job per recording). */
export async function importFromDrive(
  deps: {
    media: MediaRepository;
    storage: ObjectStorage;
    transcoder: Transcoder;
    google: GoogleClient;
    connections: DriveConnections;
    box: SecretBox;
    log: Pick<Logger, 'info' | 'warn'>;
  },
  mediaId: string
): Promise<void> {
  const item = await deps.media.byId(mediaId);
  if (!item || item.source !== 'drive' || item.status !== 'importing') return;
  const dir = await mkdtemp(join(tmpdir(), 'suffa-drive-'));
  try {
    const owner = await deps.media.creator(mediaId);
    const sealed = owner ? await deps.connections.sealedToken(owner) : null;
    if (!sealed) throw new Error('Google Drive is no longer connected');
    const token = await deps.google.accessToken(deps.box.open(sealed));
    const response = await deps.google.download(token, item.driveFileId!);
    const file = join(dir, 'original');
    await pipeline(
      Readable.fromWeb(response.body as import('node:stream/web').ReadableStream),
      createWriteStream(file)
    );
    await deps.storage.putFile('media', item.originalKey, file, item.contentType);
    await deps.media.update(item.id, { status: 'processing', progress: 0 });
    deps.log.info({ mediaId }, 'media.imported');
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 500) : String(error);
    await deps.media.update(item.id, { status: 'failed', error: message });
    throw error;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
  await processRecording(deps.media, deps.storage, deps.transcoder, mediaId, deps.log);
}
