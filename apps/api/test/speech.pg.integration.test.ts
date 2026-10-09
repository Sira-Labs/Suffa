/**
 * Server pronunciation feedback against a real Postgres (stories 15.2/15.3): the class
 * setting (default on, off for minors, all classes must allow it), the assessment with a
 * fake recogniser, and the refusals before the recogniser runs. The audio and transcript
 * never reach the database or the log. Run with SUFFA_TEST_DATABASE_URL; the database is
 * wiped.
 */
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { AuthResolver } from '../src/auth/resolver.js';
import type { Role } from '../src/authz/policies.js';
import { PgClassRepository } from '../src/classes/repository.js';
import { loadMigrations, migrate } from '../src/migrate.js';
import { RateLimiter } from '../src/observability/tunnel.js';
import { PgSpeechRepository } from '../src/speech/repository.js';
import type { ClipTranscriber } from '../src/speech/routes.js';

const url = process.env.SUFFA_TEST_DATABASE_URL;
const KITAB = 'كِتَابٌ';

describe.skipIf(!url)('Speech (Postgres)', () => {
  let pool: pg.Pool;
  let app: ReturnType<typeof createApp>;
  let offline: ReturnType<typeof createApp>;
  let heard: string | Error;
  let clips: { bytes: Uint8Array; mimeType: string }[];
  let logged: unknown[];
  let classId: string;
  /** Assessments per learner and minute; read when a learner's limiter is first made. */
  let limit: number;
  const users: Record<string, { id: string; role: Role }> = {};

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: url, max: 4 });
    await pool.query('drop schema public cascade; create schema public');
    await migrate(
      pool,
      await loadMigrations(join(import.meta.dirname, '..', 'migrations')),
      {
        info: () => undefined,
      }
    );
  });

  beforeEach(async () => {
    await pool.query('truncate users, classes, audit_log cascade');
    for (const [name, role] of [
      ['teacher', 'teacher'],
      ['otherTeacher', 'teacher'],
      ['amina', 'student'],
      ['bilal', 'student'],
    ] as const) {
      const id = randomUUID();
      await pool.query(
        'insert into users (id, email, name, role) values ($1, $2, $3, $4)',
        [id, `${name.toLowerCase()}@example.org`, name, role]
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
    ] as const) {
      await pool.query(
        `insert into class_members (class_id, user_id, class_role, status)
         values ($1, $2, $3, 'active')`,
        [classId, users[user]!.id, classRole]
      );
    }

    heard = 'كتاب';
    limit = 3;
    clips = [];
    logged = [];
    const transcribe: ClipTranscriber = async (clip) => {
      clips.push(clip);
      if (heard instanceof Error) throw heard;
      return heard;
    };
    const auth: AuthResolver = {
      actor: async (headers) => {
        const who = headers.get('x-test-user');
        return who && users[who] ? users[who] : null;
      },
    };
    const log = {
      info: (obj: object) => void logged.push(obj),
      warn: (obj: object) => void logged.push(obj),
      error: (obj: object) => void logged.push(obj),
    };
    const health = {
      schemaRevision: async () => null,
      queueDepth: async () => ({ waiting: 0, active: 0, failed: 0, deadLetter: 0 }),
    };
    const speech = {
      auth,
      log,
      speech: new PgSpeechRepository(pool),
      classes: new PgClassRepository(pool),
      limiter: () => new RateLimiter(limit, 60_000),
    };
    app = createApp({
      version: 'test',
      expectedRevision: null,
      health,
      speech: { ...speech, transcribe },
    });
    offline = createApp({
      version: 'test',
      expectedRevision: null,
      health,
      speech: { ...speech, transcribe: undefined },
    });
  });

  afterAll(async () => {
    await pool?.end();
  });

  const json = (
    target: typeof app,
    user: string,
    method: string,
    path: string,
    body?: unknown
  ) =>
    target.request(`/api/v1${path}`, {
      method,
      headers: { 'content-type': 'application/json', 'x-test-user': user },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

  const clip = (size = 2048, type = 'audio/webm') =>
    new Blob([new Uint8Array(size)], { type });

  const assess = (
    user: string,
    { audio = clip(), text = KITAB }: { audio?: Blob | string; text?: string } = {},
    target = app
  ) => {
    const form = new FormData();
    form.set('audio', audio);
    form.set('text', text);
    return target.request('/api/v1/speech/assess', {
      method: 'POST',
      headers: { 'x-test-user': user },
      body: form,
    });
  };

  it('rates a recording letter by letter and keeps neither audio nor transcript', async () => {
    const response = await assess('amina');
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      score: number;
      letters: { letter: string; status: string }[];
    };
    expect(body.score).toBe(1);
    expect(body.letters.map((l) => l.letter).join('')).toBe('كتاب');
    expect(body.letters.every((l) => l.status === 'good')).toBe(true);
    expect(clips).toHaveLength(1);
    expect(clips[0]!.mimeType).toBe('audio/webm');
    expect(clips[0]!.bytes.byteLength).toBe(2048);
    expect(JSON.stringify(logged)).not.toContain('كتاب');

    heard = 'كتاس';
    const wrong = (await (await assess('amina')).json()) as {
      score: number;
      letters: { status: string }[];
    };
    expect(wrong.score).toBeLessThan(1);
    expect(wrong.letters.at(-1)!.status).not.toBe('good');
  });

  it('is on by default, off for classes of minors, and every class must allow it', async () => {
    const settings = async (user: string) =>
      (
        (await (await json(app, user, 'GET', '/speech/settings')).json()) as {
          server: boolean;
        }
      ).server;
    expect(await settings('amina')).toBe(true);
    // Without any class, the learner decides alone.
    expect(await settings('bilal')).toBe(true);
    expect(
      (await (await json(offline, 'amina', 'GET', '/speech/settings')).json()) as object
    ).toEqual({ server: false });

    await pool.query('update classes set minors = true where id = $1', [classId]);
    expect(await settings('amina')).toBe(false);
    expect(
      await (await json(app, 'teacher', 'GET', `/classes/${classId}/speech`)).json()
    ).toEqual({ serverSpeech: false });
    expect((await assess('amina')).status).toBe(403);
    expect(clips).toHaveLength(0);

    // The teacher turns it on for the class.
    expect(
      (
        await json(app, 'teacher', 'PUT', `/classes/${classId}/speech`, {
          serverSpeech: true,
        })
      ).status
    ).toBe(204);
    expect(await settings('amina')).toBe(true);
    expect((await assess('amina')).status).toBe(200);

    // A second class that says no wins.
    const other = randomUUID();
    await pool.query(
      "insert into classes (id, name, server_speech) values ($1, 'AG Kalligrafie', false)",
      [other]
    );
    await pool.query(
      `insert into class_members (class_id, user_id, class_role, status)
       values ($1, $2, 'student', 'active')`,
      [other, users.amina!.id]
    );
    expect(await settings('amina')).toBe(false);
    // An archived class no longer counts.
    await pool.query('update classes set archived_at = now() where id = $1', [other]);
    expect(await settings('amina')).toBe(true);
  });

  it('only the class teacher reads and changes the setting', async () => {
    for (const user of ['otherTeacher', 'amina']) {
      expect((await json(app, user, 'GET', `/classes/${classId}/speech`)).status).toBe(
        403
      );
      expect(
        (
          await json(app, user, 'PUT', `/classes/${classId}/speech`, {
            serverSpeech: false,
          })
        ).status
      ).toBe(403);
    }
    for (const body of [{}, { serverSpeech: 'yes' }, { serverSpeech: true, extra: 1 }]) {
      expect(
        (await json(app, 'teacher', 'PUT', `/classes/${classId}/speech`, body)).status
      ).toBe(400);
    }
    const raw = await app.request(`/api/v1/classes/${classId}/speech`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', 'x-test-user': 'teacher' },
      body: '{not json',
    });
    expect(raw.status).toBe(400);
  });

  it('refuses bad requests before the recogniser runs', async () => {
    limit = 20;
    expect((await assess('nobody')).status).toBe(401);
    expect((await assess('amina', {}, offline)).status).toBe(503);
    expect((await assess('amina', { audio: clip(2048, 'video/x-flv') })).status).toBe(
      415
    );
    expect((await assess('amina', { audio: clip(100) })).status).toBe(400);
    expect((await assess('amina', { text: '   ' })).status).toBe(400);
    expect((await assess('amina', { text: 'ك'.repeat(301) })).status).toBe(400);
    expect((await assess('amina', { audio: 'not a file' })).status).toBe(400);
    const invalid = await assess('amina', { text: 'ٰ' });
    expect(invalid.status).toBe(400);
    expect(await invalid.json()).toEqual({ error: 'invalid_text' });
    expect(clips).toHaveLength(0);
  });

  it('limits each learner and reports a failing recogniser', async () => {
    heard = new Error('upstream 500');
    expect((await assess('amina')).status).toBe(503);
    expect((await assess('amina')).status).toBe(503);
    expect((await assess('amina')).status).toBe(503);
    expect((await assess('amina')).status).toBe(429);
    // Others keep their own budget.
    expect((await assess('bilal')).status).toBe(503);
    expect(logged).toContainEqual(
      expect.objectContaining({ userId: users.amina!.id, err: 'upstream 500' })
    );
  });

  it('rejects oversized uploads', async () => {
    const response = await assess('amina', { audio: clip(3 * 1024 * 1024) });
    expect(response.status).toBe(413);
    expect(clips).toHaveLength(0);
  });
});
