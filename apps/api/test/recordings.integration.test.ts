/**
 * Recordings end to end (stories 7.3–7.5, 8.3): multipart upload through presigned URLs,
 * transcoding with ffmpeg, publishing with consent, playback only for the class.
 * Needs SUFFA_TEST_DATABASE_URL and SUFFA_TEST_S3_ENDPOINT; ffmpeg for the transcode step.
 */
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CreateBucketCommand, S3Client } from '@aws-sdk/client-s3';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { AuthResolver } from '../src/auth/resolver.js';
import type { Role } from '../src/authz/policies.js';
import { PgClassRepository } from '../src/classes/repository.js';
import { PgMediaRepository } from '../src/media/repository.js';
import {
  ffmpegTranscoder,
  MediaService,
  processRecording,
} from '../src/media/service.js';
import { loadMigrations, migrate } from '../src/migrate.js';
import { S3ObjectStorage } from '../src/storage/s3Storage.js';

const dbUrl = process.env.SUFFA_TEST_DATABASE_URL;
const s3 = process.env.SUFFA_TEST_S3_ENDPOINT;
const hasFfmpeg = (() => {
  try {
    execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
})();
const quiet = { info: () => undefined, warn: () => undefined, error: () => undefined };

describe.skipIf(!dbUrl || !s3 || !hasFfmpeg)(
  'Recordings (Postgres + S3 + ffmpeg)',
  () => {
    let pool: pg.Pool;
    let app: ReturnType<typeof createApp>;
    let repo: PgMediaRepository;
    let storage: S3ObjectStorage;
    let dir: string;
    const queued: string[] = [];
    const classId = randomUUID();
    const users: Record<string, { id: string; role: Role }> = {};
    const settings = {
      endpoint: s3!,
      region: 'us-east-1',
      accessKeyId: 'test',
      secretAccessKey: 'test',
      buckets: {
        media: 'suffa-media',
        uploads: 'suffa-uploads',
        content: 'suffa-content',
      },
    };

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
        `insert into class_members (class_id, user_id, class_role, status)
       values ($1, $2, 'teacher', 'active'), ($1, $3, 'student', 'active')`,
        [classId, users.teacher!.id, users.amina!.id]
      );
      repo = new PgMediaRepository(pool);
      storage = new S3ObjectStorage(settings);
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
        media: {
          classes: new PgClassRepository(pool),
          repo,
          media: new MediaService(repo, storage, async (id) => {
            queued.push(id);
          }),
          audit: pool,
          auth,
          log: quiet,
        },
      });
      dir = await mkdtemp(join(tmpdir(), 'suffa-rec-'));
    });

    afterAll(async () => {
      await pool?.end();
      if (dir) await rm(dir, { recursive: true, force: true });
    });

    const call = (who: string, method: string, path: string, body?: unknown) =>
      app.request(`/api/v1/classes/${classId}/media${path}`, {
        method,
        headers: { 'x-test-user': who, 'content-type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    const viaCaddy = (path: string) => `${s3}${path.replace(/^\/media/, '')}`;

    it('uploads, transcodes, publishes and plays a recording for the class only', async () => {
      // A 4-second test tone with a still image: a small "video" with audio.
      const source = join(dir, 'lesson.mp4');
      execFileSync('ffmpeg', [
        '-hide_banner',
        '-loglevel',
        'error',
        '-f',
        'lavfi',
        '-i',
        'sine=frequency=440:duration=4',
        '-f',
        'lavfi',
        '-i',
        'color=c=teal:s=320x240:d=4',
        '-shortest',
        '-c:v',
        'libx264',
        '-c:a',
        'aac',
        source,
      ]);
      const file = await readFile(source);

      const started = await call('teacher', 'POST', '', {
        title: 'Stunde 1',
        fileName: 'lesson.mp4',
        size: file.length,
        contentType: 'video/mp4',
      });
      expect(started.status).toBe(201);
      const plan = (await started.json()) as { item: { id: string }; partCount: number };
      expect(plan.partCount).toBe(1);
      const mediaId = plan.item.id;
      expect(
        (
          await call('other', 'POST', '', {
            title: 'x',
            fileName: 'x.mp4',
            size: 1,
            contentType: 'video/mp4',
          })
        ).status
      ).toBe(403);
      expect(
        (
          await call('teacher', 'POST', '', {
            title: 'x',
            fileName: 'x.exe',
            size: 1,
            contentType: 'application/x-msdownload',
          })
        ).status
      ).toBe(422);

      // Completing before the parts are there is refused.
      expect((await call('teacher', 'POST', `/${mediaId}/complete`)).status).toBe(409);
      const { urls } = (await (
        await call('teacher', 'POST', `/${mediaId}/parts`, { partNumbers: [1] })
      ).json()) as {
        urls: Record<string, string>;
      };
      expect(urls['1']).toMatch(/^\/media\/suffa-media\/recordings\//);
      expect((await fetch(viaCaddy(urls['1']!), { method: 'PUT', body: file })).ok).toBe(
        true
      );
      expect(await (await call('teacher', 'GET', `/${mediaId}/parts`)).json()).toEqual({
        parts: [1],
      });
      expect((await call('teacher', 'POST', `/${mediaId}/complete`)).status).toBe(202);
      expect(queued).toEqual([mediaId]);

      // Before the worker ran and before publishing, learners see nothing.
      expect(await (await call('amina', 'GET', '')).json()).toEqual({ items: [] });
      await processRecording(repo, storage, ffmpegTranscoder, mediaId, quiet);
      const { items } = (await (await call('teacher', 'GET', '')).json()) as {
        items: {
          status: string;
          hasVideo: boolean;
          durationSec: number;
          progress: number;
        }[];
      };
      const item = items[0];
      expect(item).toMatchObject({ status: 'ready', hasVideo: true, progress: 100 });
      expect(item!.durationSec).toBeGreaterThan(3.5);
      expect((await call('amina', 'GET', `/${mediaId}/play`)).status).toBe(404);

      expect((await call('teacher', 'POST', `/${mediaId}/publish`, {})).status).toBe(400);
      expect(
        (await call('teacher', 'POST', `/${mediaId}/publish`, { consent: true })).status
      ).toBe(204);
      const play = (await (await call('amina', 'GET', `/${mediaId}/play`)).json()) as {
        audio: string;
        video: string;
      };
      const audio = await fetch(viaCaddy(play.audio), {
        headers: { range: 'bytes=0-15' },
      });
      expect(audio.status).toBe(206);
      expect(play.video).toMatch(/video\.mp4/);
      expect((await call('other', 'GET', `/${mediaId}/play`)).status).toBe(403);

      expect((await call('teacher', 'DELETE', `/${mediaId}`)).status).toBe(204);
      expect(
        await storage.head('media', `recordings/${classId}/${mediaId}/audio.m4a`)
      ).toBeNull();
      const audit = await pool.query(
        "select action from audit_log where action like 'media.%' order by id"
      );
      expect(audit.rows.map((r) => r.action)).toEqual([
        'media.upload_started',
        'media.published',
        'media.deleted',
      ]);
    });

    it('marks a recording that cannot be transcoded as failed', async () => {
      const plan = (await (
        await call('teacher', 'POST', '', {
          title: 'Kaputt',
          fileName: 'x.mp3',
          size: 5,
          contentType: 'audio/mpeg',
        })
      ).json()) as {
        item: { id: string };
      };
      const { urls } = (await (
        await call('teacher', 'POST', `/${plan.item.id}/parts`, { partNumbers: [1] })
      ).json()) as {
        urls: Record<string, string>;
      };
      await fetch(viaCaddy(urls['1']!), { method: 'PUT', body: 'nope!' });
      expect((await call('teacher', 'POST', `/${plan.item.id}/complete`)).status).toBe(
        202
      );
      await expect(
        processRecording(repo, storage, ffmpegTranscoder, plan.item.id, quiet)
      ).rejects.toThrow();
      const item = await repo.byId(plan.item.id);
      expect(item).toMatchObject({ status: 'failed' });
      expect(item!.error).toBeTruthy();
    });
  }
);
