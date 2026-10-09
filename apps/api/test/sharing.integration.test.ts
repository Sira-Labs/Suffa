/**
 * Sharing recordings with the teacher against a real Postgres and S3 (story 15.4): opt-in per
 * recording, only the class's teachers hear it (not admins), withdrawing deletes the file,
 * parents' consent in classes of minors, and the file goes with the account or the class
 * membership. Run with SUFFA_TEST_DATABASE_URL and SUFFA_TEST_S3_ENDPOINT; the database is
 * wiped.
 */
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { CreateBucketCommand, S3Client } from '@aws-sdk/client-s3';
import pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { AuthResolver } from '../src/auth/resolver.js';
import type { Role } from '../src/authz/policies.js';
import { PgClassRepository } from '../src/classes/repository.js';
import { runMaintenance } from '../src/jobs/maintenance.js';
import { loadMigrations, migrate } from '../src/migrate.js';
import { RateLimiter } from '../src/observability/tunnel.js';
import { PgPrivacyRepository } from '../src/privacy/repository.js';
import {
  MAX_SHARED_PER_CLASS,
  PgSharingRepository,
  purgeDeletedFiles,
} from '../src/sharing/repository.js';
import { S3ObjectStorage } from '../src/storage/s3Storage.js';

const dbUrl = process.env.SUFFA_TEST_DATABASE_URL;
const s3 = process.env.SUFFA_TEST_S3_ENDPOINT;
const quiet = { info: () => undefined, warn: () => undefined, error: () => undefined };
const TEXT = 'السَّلامُ عَلَيْكُمْ.';

describe.skipIf(!dbUrl || !s3)('Shared recordings (Postgres + S3)', () => {
  let pool: pg.Pool;
  let storage: S3ObjectStorage;
  let app: ReturnType<typeof createApp>;
  let classId: string;
  let limit: number;
  const users: Record<string, { id: string; role: Role }> = {};
  const settings = {
    endpoint: s3!,
    region: 'us-east-1',
    accessKeyId: 'test',
    secretAccessKey: 'test',
    buckets: { media: 'suffa-media', uploads: 'suffa-uploads', content: 'suffa-content' },
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
      .send(new CreateBucketCommand({ Bucket: 'suffa-uploads' }))
      .catch(() => undefined);
    storage = new S3ObjectStorage(settings);
  });

  beforeEach(async () => {
    await pool.query('truncate users, classes, audit_log, object_deletions cascade');
    for (const [name, role] of [
      ['teacher', 'teacher'],
      ['otherTeacher', 'teacher'],
      ['admin', 'admin'],
      ['amina', 'student'],
      ['bilal', 'student'],
    ] as const) {
      const id = randomUUID();
      await pool.query(
        'insert into users (id, email, name, role) values ($1, $2, $3, $4)',
        [id, `${name.toLowerCase()}@example.org`, name === 'amina' ? 'Amina' : name, role]
      );
      users[name] = { id, role };
    }
    classId = randomUUID();
    await pool.query("insert into classes (id, name) values ($1, 'Arabisch 1a')", [
      classId,
    ]);
    for (const [user, classRole] of [
      ['teacher', 'teacher'],
      ['amina', 'student'],
      ['bilal', 'student'],
    ] as const) {
      await pool.query(
        `insert into class_members (class_id, user_id, class_role, status)
         values ($1, $2, $3, 'active')`,
        [classId, users[user]!.id, classRole]
      );
    }
    limit = 10;
    const auth: AuthResolver = {
      actor: async (headers) => users[headers.get('x-test-user') ?? ''] ?? null,
    };
    app = createApp({
      version: 'test',
      expectedRevision: null,
      health: {
        schemaRevision: async () => null,
        queueDepth: async () => ({ waiting: 0, active: 0, failed: 0, deadLetter: 0 }),
      },
      sharing: {
        auth,
        log: quiet,
        repo: new PgSharingRepository(pool),
        classes: new PgClassRepository(pool),
        storage,
        purge: () => purgeDeletedFiles(pool, storage),
        limiter: () => new RateLimiter(limit, 60_000),
      },
    });
  });

  afterAll(async () => {
    await pool?.end();
  });

  const json = (user: string, method: string, path: string, body?: unknown) =>
    app.request(`/api/v1${path}`, {
      method,
      headers: { 'content-type': 'application/json', 'x-test-user': user },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

  const share = (
    user: string,
    {
      audio = new Blob([new Uint8Array(2048).fill(7)], { type: 'audio/mp4' }),
      text = TEXT,
      target = classId,
      score = '0.8',
    }: { audio?: Blob; text?: string; target?: string; score?: string } = {}
  ) => {
    const form = new FormData();
    form.set('audio', audio);
    form.set('text', text);
    form.set('classId', target);
    form.set('score', score);
    return app.request('/api/v1/me/shared-recordings', {
      method: 'POST',
      headers: { 'x-test-user': user },
      body: form,
    });
  };

  const keys = async () =>
    (
      await pool.query<{ object_key: string }>('select object_key from shared_recordings')
    ).rows.map((r) => r.object_key);

  type Item = {
    id: string;
    text: string;
    score: number | null;
    comment: string | null;
    heardAt: string | null;
    url: string;
    learner?: { name: string | null };
  };

  it('the learner shares a recording; only the class teacher hears and comments it', async () => {
    const created = await share('amina');
    expect(created.status).toBe(201);
    const { id } = (await created.json()) as { id: string };
    const [key] = await keys();
    expect(key).toBe(`shared/${classId}/${users.amina!.id}/${id}.m4a`);
    expect((await storage.head('uploads', key!))?.size).toBe(2048);

    const list = await json('teacher', 'GET', `/classes/${classId}/shared-recordings`);
    expect(list.status).toBe(200);
    const { items } = (await list.json()) as { items: Item[] };
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      id,
      text: TEXT,
      score: 0.8,
      learner: { name: 'Amina' },
    });
    expect(items[0]!.url).toMatch(/^\/media\/suffa-uploads\/shared\//);

    // Nobody else: not another teacher, not an admin, not a classmate, not anonymous.
    for (const user of ['otherTeacher', 'admin', 'bilal']) {
      expect(
        (await json(user, 'GET', `/classes/${classId}/shared-recordings`)).status
      ).toBe(403);
      expect(
        (
          await json(user, 'PATCH', `/classes/${classId}/shared-recordings/${id}`, {
            heard: true,
          })
        ).status
      ).toBe(403);
    }
    expect(
      (await json('nobody', 'GET', `/classes/${classId}/shared-recordings`)).status
    ).toBe(401);

    expect(
      (
        await json('teacher', 'PATCH', `/classes/${classId}/shared-recordings/${id}`, {
          comment: '  Schön! Das ع noch tiefer.  ',
          heard: true,
        })
      ).status
    ).toBe(204);
    for (const body of [
      {},
      { comment: 'x'.repeat(501) },
      { heard: 'yes' },
      { extra: 1 },
    ]) {
      expect(
        (
          await json(
            'teacher',
            'PATCH',
            `/classes/${classId}/shared-recordings/${id}`,
            body
          )
        ).status
      ).toBe(400);
    }
    expect(
      (
        await json(
          'teacher',
          'PATCH',
          `/classes/${classId}/shared-recordings/${randomUUID()}`,
          {
            heard: true,
          }
        )
      ).status
    ).toBe(404);

    const mine = (await (await json('amina', 'GET', '/me/shared-recordings')).json()) as {
      targets: { classId: string; allowed: boolean }[];
      items: (Item & { className: string })[];
    };
    expect(mine.targets).toEqual([{ classId, name: 'Arabisch 1a', allowed: true }]);
    expect(mine.items[0]).toMatchObject({
      className: 'Arabisch 1a',
      comment: 'Schön! Das ع noch tiefer.',
    });
    expect(mine.items[0]!.heardAt).not.toBeNull();

    // Clearing the comment.
    await json('teacher', 'PATCH', `/classes/${classId}/shared-recordings/${id}`, {
      comment: '',
      heard: false,
    });
    const after = (await (
      await json('teacher', 'GET', `/classes/${classId}/shared-recordings`)
    ).json()) as {
      items: Item[];
    };
    expect(after.items[0]).toMatchObject({ comment: null, heardAt: null });
  });

  it('withdrawing deletes the recording and its file; only the learner can', async () => {
    const { id } = (await (await share('amina')).json()) as { id: string };
    const [key] = await keys();
    expect((await json('bilal', 'DELETE', `/me/shared-recordings/${id}`)).status).toBe(
      404
    );
    expect((await json('teacher', 'DELETE', `/me/shared-recordings/${id}`)).status).toBe(
      404
    );
    expect((await json('amina', 'DELETE', `/me/shared-recordings/${id}`)).status).toBe(
      204
    );
    expect(await keys()).toEqual([]);
    expect(await storage.head('uploads', key!)).toBeNull();
    expect((await pool.query('select 1 from object_deletions')).rowCount).toBe(0);
    expect((await json('amina', 'DELETE', `/me/shared-recordings/${id}`)).status).toBe(
      404
    );
    expect(
      (await json('amina', 'DELETE', '/me/shared-recordings/not-a-uuid')).status
    ).toBe(404);
  });

  it('in a class of minors, sharing waits for the parents’ consent', async () => {
    await share('amina');
    const [before] = await keys();
    // Marking the class as minors removes what was shared without consent.
    await pool.query('update classes set minors = true where id = $1', [classId]);
    expect(await keys()).toEqual([]);
    expect(await purgeDeletedFiles(pool, storage)).toBe(1);
    expect(await storage.head('uploads', before!)).toBeNull();

    const targets = (await (
      await json('amina', 'GET', '/me/shared-recordings')
    ).json()) as {
      targets: { allowed: boolean }[];
    };
    expect(targets.targets[0]!.allowed).toBe(false);
    const refused = await share('amina');
    expect(refused.status).toBe(403);
    expect(await refused.json()).toEqual({ error: 'consent_needed' });

    const consent = (user: string, target: string, value: unknown) =>
      json(user, 'PUT', `/classes/${classId}/members/${target}/consent`, {
        consent: value,
      });
    expect((await consent('otherTeacher', users.amina!.id, true)).status).toBe(403);
    expect((await consent('amina', users.amina!.id, true)).status).toBe(403);
    expect((await consent('teacher', users.amina!.id, 'yes')).status).toBe(400);
    // Teachers have no consent to record; strangers are not in the class.
    expect((await consent('teacher', users.teacher!.id, true)).status).toBe(404);
    expect((await consent('teacher', users.admin!.id, true)).status).toBe(404);
    expect((await consent('teacher', users.amina!.id, true)).status).toBe(204);
    expect((await share('amina')).status).toBe(201);
    // Bilal still has no consent: his share is refused, and the teacher hears only Amina.
    expect((await share('bilal')).status).toBe(403);
    expect(
      (
        (await (
          await json('teacher', 'GET', `/classes/${classId}/shared-recordings`)
        ).json()) as {
          items: unknown[];
        }
      ).items
    ).toHaveLength(1);

    // Revoking deletes what she shared, file included.
    const [key] = await keys();
    expect((await consent('teacher', users.amina!.id, false)).status).toBe(204);
    expect(await keys()).toEqual([]);
    expect(await storage.head('uploads', key!)).toBeNull();
    const { rows } = await pool.query<{ action: string }>(
      'select action from audit_log where target_id = $1 order by id',
      [classId]
    );
    expect(rows.map((r) => r.action)).toEqual([
      'class.parental_consent_recorded',
      'class.parental_consent_revoked',
    ]);
  });

  it('leaving the class or deleting the account removes the recordings and files', async () => {
    await share('amina');
    await share('bilal');
    const [aminaKey, bilalKey] = (
      await pool.query<{ object_key: string }>(
        `select object_key from shared_recordings r join users u on u.id = r.user_id
          order by u.name`
      )
    ).rows.map((r) => r.object_key);

    const exported = await new PgPrivacyRepository(pool).export(users.amina!.id);
    expect(exported.sharedRecordings).toEqual([
      expect.objectContaining({ class: 'Arabisch 1a', text: TEXT, size_bytes: 2048 }),
    ]);

    await new PgClassRepository(pool).remove(
      { id: users.teacher!.id, ip: null },
      classId,
      users.bilal!.id
    );
    await new PgPrivacyRepository(pool).delete(users.amina!.id, null);
    expect(await keys()).toEqual([]);
    // The worker's maintenance run deletes the queued files.
    await runMaintenance(pool, { task: 'purge-files' }, quiet, storage);
    expect(await storage.head('uploads', aminaKey!)).toBeNull();
    expect(await storage.head('uploads', bilalKey!)).toBeNull();
    expect((await pool.query('select 1 from object_deletions')).rowCount).toBe(0);
  });

  it('refuses what it cannot or should not store', async () => {
    const other = randomUUID();
    await pool.query("insert into classes (id, name) values ($1, 'Fremde Klasse')", [
      other,
    ]);
    expect((await share('amina', { target: other })).status).toBe(403);
    expect((await share('teacher')).status).toBe(403);
    expect((await share('nobody')).status).toBe(401);
    expect(
      (
        await share('amina', {
          audio: new Blob([new Uint8Array(2048)], { type: 'video/x-flv' }),
        })
      ).status
    ).toBe(415);
    expect(
      (
        await share('amina', {
          audio: new Blob([new Uint8Array(100)], { type: 'audio/webm' }),
        })
      ).status
    ).toBe(400);
    expect((await share('amina', { text: ' ' })).status).toBe(400);
    expect((await share('amina', { target: 'x' })).status).toBe(400);
    expect((await share('amina', { score: '1.5' })).status).toBe(400);
    expect(
      (
        await share('amina', {
          audio: new Blob([new Uint8Array(6 * 1024 * 1024)], { type: 'audio/webm' }),
        })
      ).status
    ).toBe(413);
    expect(await keys()).toEqual([]);
  });

  it('caps recordings per class and shares per minute', async () => {
    limit = 2;
    expect((await share('amina')).status).toBe(201);
    expect((await share('amina')).status).toBe(201);
    expect((await share('amina')).status).toBe(429);

    for (let i = 0; i < MAX_SHARED_PER_CLASS; i++) {
      await pool.query(
        `insert into shared_recordings (id, user_id, class_id, object_key, content_type,
                                        size_bytes, text)
         values ($1, $2, $3, $4, 'audio/mp4', 1, 'x')`,
        [randomUUID(), users.bilal!.id, classId, `test/${randomUUID()}`]
      );
    }
    const full = await share('bilal');
    expect(full.status).toBe(409);
    expect(await full.json()).toEqual({ error: 'too_many' });
  });
});
