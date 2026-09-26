/**
 * Google Drive import end to end (story 7.2) with a fake Google: connect via OAuth (state
 * bound to the teacher, token sealed at rest), import picked files, copy into storage.
 * Needs SUFFA_TEST_DATABASE_URL and SUFFA_TEST_S3_ENDPOINT.
 */
import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { CreateBucketCommand, S3Client } from '@aws-sdk/client-s3';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { AuthResolver } from '../src/auth/resolver.js';
import type { Role } from '../src/authz/policies.js';
import { PgClassRepository } from '../src/classes/repository.js';
import { GoogleError, type DriveFile, type GoogleClient } from '../src/drive/google.js';
import {
  DriveService,
  importFromDrive,
  PgDriveConnections,
} from '../src/drive/service.js';
import { PgMediaRepository } from '../src/media/repository.js';
import type { Transcoder } from '../src/media/service.js';
import { loadMigrations, migrate } from '../src/migrate.js';
import { SecretBox } from '../src/security/secretBox.js';
import { S3ObjectStorage } from '../src/storage/s3Storage.js';

const dbUrl = process.env.SUFFA_TEST_DATABASE_URL;
const s3 = process.env.SUFFA_TEST_S3_ENDPOINT;
const quiet = { info: () => undefined, warn: () => undefined, error: () => undefined };
const SECRET = 'drive-test-secret-0123456789-abcdefghij';

class FakeGoogle implements GoogleClient {
  files: Record<string, DriveFile & { body: string }> = {
    f_lesson_0001: {
      id: 'f_lesson_0001',
      name: 'Stunde 4.mp3',
      mimeType: 'audio/mpeg',
      size: 11,
      body: 'fake-mp3-11',
    },
    // Drive often labels an MP4 as a generic binary file.
    f_video_0001: {
      id: 'f_video_0001',
      name: 'Unterricht 5.MP4',
      mimeType: 'application/octet-stream',
      size: 12,
      body: 'fake-mp4-012',
    },
    f_notes_00001: {
      id: 'f_notes_00001',
      name: 'notes.pdf',
      mimeType: 'application/pdf',
      size: 5,
      body: 'pdf!!',
    },
  };
  revoked: string[] = [];
  authUrl(state: string) {
    return `https://accounts.google.com/o/oauth2/v2/auth?state=${state}`;
  }
  async exchangeCode(code: string) {
    if (code !== 'good-code') throw new GoogleError('invalid_grant', 400);
    return { refreshToken: 'refresh-token-1', accessToken: 'a' };
  }
  async accessToken(refresh: string) {
    if (refresh !== 'refresh-token-1') throw new GoogleError('invalid_grant', 400);
    return 'access-1';
  }
  async file(_token: string, id: string) {
    const f = this.files[id];
    if (!f) throw new GoogleError('not found', 404);
    return f;
  }
  async download(_token: string, id: string) {
    return new Response(this.files[id]!.body);
  }
  async revoke(token: string) {
    this.revoked.push(token);
  }
}

const fakeTranscoder: Transcoder = {
  probe: async () => ({ durationSec: 60, hasVideo: false, hasAudio: true }),
  transcode: async (_input, dir, _info, onProgress) => {
    const audio = join(dir, 'audio.m4a');
    await writeFile(audio, 'aac');
    onProgress(100);
    return { audio, video: null };
  },
};

describe.skipIf(!dbUrl || !s3)('Google Drive import (Postgres + S3)', () => {
  let pool: pg.Pool;
  let app: ReturnType<typeof createApp>;
  const google = new FakeGoogle();
  const queued: string[] = [];
  const classId = randomUUID();
  const users: Record<string, { id: string; role: Role }> = {};
  const settings = {
    endpoint: s3!,
    region: 'us-east-1',
    accessKeyId: 'test',
    secretAccessKey: 'test',
    buckets: { media: 'suffa-media', uploads: 'suffa-uploads', content: 'suffa-content' },
  };
  const box = new SecretBox(SECRET, 'drive');

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: dbUrl, max: 4 });
    await pool.query('drop schema public cascade; create schema public');
    await migrate(
      pool,
      await loadMigrations(join(import.meta.dirname, '..', 'migrations')),
      quiet
    );
    const client = new S3Client({
      ...settings,
      forcePathStyle: true,
      credentials: settings,
    });
    await client
      .send(new CreateBucketCommand({ Bucket: 'suffa-media' }))
      .catch(() => undefined);
    for (const [name, role] of [
      ['teacher', 'teacher'],
      ['other', 'teacher'],
      ['amina', 'student'],
    ] as const) {
      const id = randomUUID();
      await pool.query('insert into users (id, email, role) values ($1, $2, $3)', [
        id,
        `${name}@example.org`,
        role,
      ]);
      users[name] = { id, role };
    }
    await pool.query("insert into classes (id, name) values ($1, 'Arabisch 1a')", [
      classId,
    ]);
    await pool.query(
      "insert into class_members (class_id, user_id, class_role, status) values ($1, $2, 'teacher', 'active')",
      [classId, users.teacher!.id]
    );
    const auth: AuthResolver = {
      actor: async (h) => users[h.get('x-test-user') ?? ''] ?? null,
    };
    app = createApp({
      version: 'test',
      expectedRevision: null,
      health: {
        schemaRevision: async () => null,
        queueDepth: async () => ({ waiting: 0, active: 0, failed: 0, deadLetter: 0 }),
      },
      drive: {
        drive: new DriveService(
          google,
          new PgDriveConnections(pool),
          box,
          new PgMediaRepository(pool),
          async (id) => {
            queued.push(id);
          }
        ),
        google,
        classes: new PgClassRepository(pool),
        picker: { apiKey: 'browser-key', appId: '123' },
        stateSecret: SECRET,
        auth,
        log: quiet,
      },
    });
  });

  afterAll(async () => {
    await pool?.end();
  });

  const call = (who: string, method: string, path: string, body?: unknown) =>
    app.request(`/api/v1${path}`, {
      method,
      headers: { 'x-test-user': who, 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

  it('connects Drive for the teacher who started it, sealed at rest', async () => {
    expect((await call('amina', 'GET', '/drive')).status).toBe(403);
    expect(await (await call('teacher', 'GET', '/drive')).json()).toEqual({
      connected: false,
      apiKey: 'browser-key',
      appId: '123',
    });
    const start = await call(
      'teacher',
      'GET',
      `/drive/connect?returnTo=/classes/${classId}`
    );
    expect(start.status).toBe(302);
    const state = new URL(start.headers.get('location')!).searchParams.get('state')!;

    // Another teacher cannot finish this consent.
    const hijack = await call(
      'other',
      'GET',
      `/drive/callback?code=good-code&state=${state}`
    );
    expect(hijack.headers.get('location')).toBe('/classes?drive=failed');
    const bad = await call('teacher', 'GET', `/drive/callback?code=bad&state=${state}`);
    expect(bad.headers.get('location')).toBe(`/classes/${classId}?drive=failed`);
    const ok = await call(
      'teacher',
      'GET',
      `/drive/callback?code=good-code&state=${state}`
    );
    expect(ok.headers.get('location')).toBe(`/classes/${classId}?drive=connected`);

    const stored = await pool.query('select refresh_token_sealed from drive_connections');
    expect(stored.rows[0].refresh_token_sealed).not.toContain('refresh-token-1');
    expect(await (await call('teacher', 'POST', '/drive/token')).json()).toEqual({
      accessToken: 'access-1',
    });
  });

  it('imports picked recordings and copies them into storage', async () => {
    const refused = await call('teacher', 'POST', `/classes/${classId}/media/drive`, {
      fileIds: ['f_notes_00001'],
    });
    expect(await refused.json()).toEqual({ error: 'unsupported_type' });
    expect(
      (
        await call('other', 'POST', `/classes/${classId}/media/drive`, {
          fileIds: ['f_lesson_0001'],
        })
      ).status
    ).toBe(403);

    const accepted = await call('teacher', 'POST', `/classes/${classId}/media/drive`, {
      fileIds: ['f_lesson_0001'],
    });
    expect(accepted.status).toBe(202);
    const { ids } = (await accepted.json()) as { ids: string[] };
    expect(queued).toEqual(ids);

    const media = new PgMediaRepository(pool);
    expect(await media.byId(ids[0]!)).toMatchObject({
      status: 'importing',
      title: 'Stunde 4',
      source: 'drive',
    });
    const storage = new S3ObjectStorage(settings);
    await importFromDrive(
      {
        media,
        storage,
        transcoder: fakeTranscoder,
        google,
        connections: new PgDriveConnections(pool),
        box,
        log: quiet,
      },
      ids[0]!
    );
    const item = await media.byId(ids[0]!);
    expect(item).toMatchObject({ status: 'ready', durationSec: 60 });
    expect(
      new TextDecoder().decode((await storage.get('media', item!.originalKey))!)
    ).toBe('fake-mp3-11');
  });

  it('imports an MP4 that Drive labels as a generic binary file', async () => {
    const accepted = await call('teacher', 'POST', `/classes/${classId}/media/drive`, {
      fileIds: ['f_video_0001'],
    });
    expect(accepted.status).toBe(202);
    const { ids } = (await accepted.json()) as { ids: string[] };
    expect(await new PgMediaRepository(pool).byId(ids[0]!)).toMatchObject({
      contentType: 'video/mp4',
      title: 'Unterricht 5',
    });
  });

  it('disconnects and revokes', async () => {
    expect((await call('teacher', 'DELETE', '/drive')).status).toBe(204);
    expect(google.revoked).toEqual(['refresh-token-1']);
    expect((await call('teacher', 'POST', '/drive/token')).status).toBe(409);
  });
});
