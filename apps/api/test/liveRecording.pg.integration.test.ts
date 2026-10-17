/**
 * Recording live lessons (ADR-0029) against Postgres: the teacher starts and stops the
 * recording of a live session; it becomes an unpublished class recording that the worker
 * follows until the file is stored, then hands to the transcode. LiveKit Egress and the
 * object store are fakes here; the browser test (apps/e2e, E2E_EGRESS=1) runs the real ones.
 * Run with SUFFA_TEST_DATABASE_URL=postgres://… ; skipped otherwise. The database is wiped.
 */
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { AuthResolver } from '../src/auth/resolver.js';
import type { Role } from '../src/authz/policies.js';
import { PgClassRepository } from '../src/classes/repository.js';
import { PgListeningRepository } from '../src/media/listening.js';
import { PgMediaRepository } from '../src/media/repository.js';
import { CLASS_QUOTA_BYTES, MediaService } from '../src/media/service.js';
import type { ObjectStorage } from '../src/storage/objectStorage.js';
import type { LiveRecorder, RecordingState } from '../src/live/recorder.js';
import { LiveRecordings } from '../src/live/recording.js';
import { PgLiveRecordingRepository } from '../src/live/recordingRepository.js';
import { PgLiveSessionRepository, type LiveSession } from '../src/live/repository.js';
import type { LiveRooms } from '../src/live/rooms.js';
import { loadMigrations, migrate } from '../src/migrate.js';

const url = process.env.SUFFA_TEST_DATABASE_URL;
const quiet = { info: () => undefined, warn: () => undefined, error: () => undefined };

class FakeRooms implements LiveRooms {
  readonly url = 'wss://live.example.org';
  closed: string[] = [];
  async token() {
    return 'token';
  }
  async setFloor() {
    return true;
  }
  async close(room: string) {
    this.closed.push(room);
  }
}

class FakeRecorder implements LiveRecorder {
  started: { room: string; key: string; egressId: string }[] = [];
  stopped: string[] = [];
  refuse = false;
  states = new Map<string, RecordingState>();
  async start(room: string, key: string) {
    if (this.refuse) throw new Error('no egress worker available');
    const egressId = `EG_${this.started.length + 1}`;
    this.started.push({ room, key, egressId });
    this.states.set(egressId, { state: 'running' });
    return egressId;
  }
  async stop(egressId: string) {
    this.stopped.push(egressId);
  }
  async state(egressId: string) {
    return this.states.get(egressId) ?? { state: 'failed' as const, error: 'unknown' };
  }
}

describe.skipIf(!url)('Recording live lessons (Postgres)', () => {
  let pool: pg.Pool;
  let rooms: FakeRooms;
  let recorder: FakeRecorder;
  let recordings: LiveRecordings;
  let stored: Map<string, number>;
  let followed: string[];
  let transcoded: string[];
  let now = new Date('2026-10-13T16:00:00.000Z');
  let classId: string;
  const users: Record<string, { id: string; role: Role }> = {};
  const apps: Record<'on' | 'off', ReturnType<typeof createApp>> = {} as never;

  const auth: AuthResolver = {
    actor: async (h) => users[h.get('x-test-user') ?? ''] ?? null,
  };
  /** The object store of the class recordings; nothing is ever written to it here. */
  const noFiles = {
    delete: async () => undefined,
    abortMultipartUpload: async () => undefined,
  } as unknown as ObjectStorage;

  const build = (withRecorder: boolean) =>
    createApp({
      version: 'test',
      expectedRevision: null,
      health: {
        schemaRevision: async () => null,
        queueDepth: async () => ({ waiting: 0, active: 0, failed: 0, deadLetter: 0 }),
      },
      live: {
        classes: new PgClassRepository(pool),
        sessions: new PgLiveSessionRepository(pool, () => now),
        rooms,
        recordings: withRecorder ? recordings : undefined,
        auth,
        log: quiet,
        now: () => now,
      },
      media: {
        classes: new PgClassRepository(pool),
        repo: new PgMediaRepository(pool),
        media: new MediaService(
          new PgMediaRepository(pool),
          noFiles,
          async () => undefined
        ),
        audit: pool,
        auth,
        log: quiet,
        listening: new PgListeningRepository(pool),
        recordingLive: (mediaId) =>
          new PgLiveRecordingRepository(pool).sessionLive(mediaId, now),
      },
    });

  const call = async (
    who: string,
    method: string,
    path: string,
    body?: unknown,
    app: ReturnType<typeof createApp> = apps.on
  ) => {
    const res = await app.request(`/api/v1/classes/${classId}/live${path}`, {
      method,
      headers: {
        'x-test-user': who,
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, body: (await res.json().catch(() => null)) as never };
  };

  /** A live session of the class. */
  const live = async (title = 'Lektion 5') => {
    const created = await call('teacher', 'POST', '', {
      title,
      startsAt: now.toISOString(),
      durationMinutes: 60,
    });
    const session = (created.body as { session: LiveSession }).session;
    await call('teacher', 'POST', `/${session.id}/start`);
    return session;
  };

  const item = async (id: string) =>
    (
      await pool.query(
        `select source, status, title, original_key, original_size, egress_id, error,
                published_at
           from media_items where id = $1`,
        [id]
      )
    ).rows[0];

  const pointer = async (sessionId: string) =>
    (
      await pool.query<{ recording_media_id: string | null }>(
        'select recording_media_id from live_sessions where id = $1',
        [sessionId]
      )
    ).rows[0]!.recording_media_id;

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: url, max: 4 });
    await pool.query('drop schema public cascade; create schema public');
    await migrate(
      pool,
      await loadMigrations(join(import.meta.dirname, '..', 'migrations')),
      quiet
    );
  });

  beforeEach(async () => {
    now = new Date('2026-10-13T16:00:00.000Z');
    rooms = new FakeRooms();
    recorder = new FakeRecorder();
    stored = new Map();
    followed = [];
    transcoded = [];
    recordings = new LiveRecordings({
      recordings: new PgLiveRecordingRepository(pool),
      media: new PgMediaRepository(pool),
      recorder,
      storage: {
        head: async (_bucket, key) =>
          stored.has(key) ? { size: stored.get(key)!, contentType: 'video/mp4' } : null,
      },
      follow: async (id) => {
        followed.push(id);
      },
      transcode: async (id) => {
        transcoded.push(id);
      },
      log: quiet,
      now: () => now,
    });
    apps.on = build(true);
    apps.off = build(false);
    await pool.query('truncate users, classes, audit_log cascade');
    classId = randomUUID();
    await pool.query("insert into classes (id, name) values ($1, 'Arabisch 1a')", [
      classId,
    ]);
    for (const [name, role, classRole] of [
      ['teacher', 'teacher', 'teacher'],
      ['learner', 'student', 'student'],
    ] as const) {
      const id = randomUUID();
      await pool.query(
        'insert into users (id, email, name, role) values ($1, $2, $3, $4)',
        [id, `${name}@example.org`, name, role]
      );
      users[name] = { id, role };
      await pool.query(
        `insert into class_members (class_id, user_id, class_role, status)
         values ($1, $2, $3, 'active')`,
        [classId, id, classRole]
      );
    }
  });

  afterAll(async () => {
    await pool?.end();
  });

  it('records a live session into an unpublished class recording that everyone is told of', async () => {
    const session = await live();
    const started = await call('teacher', 'POST', `/${session.id}/recording`);
    expect(started.status).toBe(201);
    expect((started.body as { session: LiveSession }).session.recording).toBe(true);

    const mediaId = (await pointer(session.id))!;
    expect(await item(mediaId)).toMatchObject({
      source: 'live',
      status: 'recording',
      title: 'Lektion 5 · 2026-10-13',
      original_key: `recordings/${classId}/${mediaId}/original.mp4`,
      egress_id: 'EG_1',
      published_at: null,
    });
    expect(recorder.started).toEqual([
      {
        room: `live-${session.id}`,
        key: `recordings/${classId}/${mediaId}/original.mp4`,
        egressId: 'EG_1',
      },
    ]);
    expect(followed).toEqual([mediaId]);

    // Learners learn before joining that it may be recorded, and that it is.
    const list = await call('learner', 'GET', '');
    expect(list.body).toMatchObject({
      enabled: true,
      recordingEnabled: true,
      sessions: [{ id: session.id, recording: true }],
    });
    expect((await call('teacher', 'POST', `/${session.id}/recording`)).body).toEqual({
      error: 'already_recording',
    });
  });

  it('lets only the teacher record, only a live session, only where Egress is set up', async () => {
    const session = await live();
    expect((await call('learner', 'POST', `/${session.id}/recording`)).status).toBe(403);
    expect((await call('learner', 'DELETE', `/${session.id}/recording`)).status).toBe(
      403
    );

    const off = await call(
      'teacher',
      'POST',
      `/${session.id}/recording`,
      undefined,
      apps.off
    );
    expect(off).toEqual({ status: 503, body: { error: 'recording_unavailable' } });
    expect((await call('learner', 'GET', '', undefined, apps.off)).body).toMatchObject({
      recordingEnabled: false,
    });

    await call('teacher', 'POST', `/${session.id}/end`);
    expect((await call('teacher', 'POST', `/${session.id}/recording`)).body).toEqual({
      error: 'not_live',
    });
    expect(recorder.started).toEqual([]);
  });

  it('stops the recording and can start a new one, audit-logged', async () => {
    const session = await live();
    await call('teacher', 'POST', `/${session.id}/recording`);
    const stopped = await call('teacher', 'DELETE', `/${session.id}/recording`);
    expect(stopped.status).toBe(200);
    expect((stopped.body as { session: LiveSession }).session.recording).toBe(false);
    expect(recorder.stopped).toEqual(['EG_1']);
    expect((await call('teacher', 'DELETE', `/${session.id}/recording`)).body).toEqual({
      error: 'not_recording',
    });

    expect((await call('teacher', 'POST', `/${session.id}/recording`)).status).toBe(201);
    const { rows } = await pool.query<{ action: string }>(
      `select action from audit_log where action like 'live.recording%' order by id`
    );
    expect(rows.map((r) => r.action)).toEqual([
      'live.recording_started',
      'live.recording_stopped',
      'live.recording_started',
    ]);
  });

  it('keeps a running recording, and lets the teacher delete one that is over', async () => {
    const session = await live();
    await call('teacher', 'POST', `/${session.id}/recording`);
    const mediaId = (await pointer(session.id))!;
    const remove = async () =>
      (
        await apps.on.request(`/api/v1/classes/${classId}/media/${mediaId}`, {
          method: 'DELETE',
          headers: { 'x-test-user': 'teacher' },
        })
      ).status;
    expect(await remove()).toBe(409);
    // Stopped, but the worker has not seen it yet (or never will): the test run can go.
    await call('teacher', 'DELETE', `/${session.id}/recording`);
    expect(await item(mediaId)).toMatchObject({ status: 'recording' });
    expect(await remove()).toBe(204);
    expect(await item(mediaId)).toBeUndefined();
    // The worker following it finds nothing left to do.
    expect(await recordings.follow(mediaId)).toBe('done');
  });

  it('stops the recording when the teacher ends the session', async () => {
    const session = await live();
    await call('teacher', 'POST', `/${session.id}/recording`);
    await call('teacher', 'POST', `/${session.id}/end`);
    expect(recorder.stopped).toEqual(['EG_1']);
    expect(rooms.closed).toEqual([`live-${session.id}`]);
    expect(await pointer(session.id)).toBeNull();
  });

  it('leaves nothing behind when Egress refuses to record', async () => {
    const session = await live();
    recorder.refuse = true;
    expect((await call('teacher', 'POST', `/${session.id}/recording`)).body).toEqual({
      error: 'recording_failed',
    });
    expect(await pointer(session.id)).toBeNull();
    const { rows } = await pool.query('select 1 from media_items');
    expect(rows).toEqual([]);
    recorder.refuse = false;
    expect((await call('teacher', 'POST', `/${session.id}/recording`)).status).toBe(201);
  });

  it('stops the egress and frees the session when the worker cannot be told', async () => {
    const session = await live();
    let failFollow = true;
    recordings = new LiveRecordings({
      recordings: new PgLiveRecordingRepository(pool),
      media: new PgMediaRepository(pool),
      recorder,
      storage: { head: async () => null },
      follow: async () => {
        if (failFollow) throw new Error('queue unavailable');
      },
      transcode: async () => undefined,
      log: quiet,
      now: () => now,
    });
    apps.on = build(true);
    expect((await call('teacher', 'POST', `/${session.id}/recording`)).body).toEqual({
      error: 'recording_failed',
    });
    expect(recorder.stopped).toEqual(['EG_1']);
    expect(await pointer(session.id)).toBeNull();
    expect((await pool.query('select 1 from media_items')).rows).toEqual([]);
    failFollow = false;
    expect((await call('teacher', 'POST', `/${session.id}/recording`)).status).toBe(201);
  });

  it('records only while the class has room for it', async () => {
    const session = await live();
    await pool.query(
      `insert into media_items (id, class_id, title, source, status, original_key,
                                original_size, content_type)
       values ($1, $2, 'Alt', 'upload', 'ready', 'k', $3, 'video/mp4')`,
      [randomUUID(), classId, CLASS_QUOTA_BYTES - 1024 ** 3]
    );
    expect((await call('teacher', 'POST', `/${session.id}/recording`)).body).toEqual({
      error: 'quota_exceeded',
    });
  });

  describe('the worker following a recording', () => {
    it('waits while Egress writes, then hands the stored file to the transcode', async () => {
      const session = await live();
      await call('teacher', 'POST', `/${session.id}/recording`);
      const mediaId = (await pointer(session.id))!;
      expect(await recordings.follow(mediaId)).toBe('running');

      await call('teacher', 'DELETE', `/${session.id}/recording`);
      const key = `recordings/${classId}/${mediaId}/original.mp4`;
      recorder.states.set('EG_1', { state: 'stored', bytes: 4096 });
      stored.set(key, 4096);
      expect(await recordings.follow(mediaId)).toBe('done');
      expect(await item(mediaId)).toMatchObject({
        status: 'processing',
        original_size: '4096',
        published_at: null,
      });
      expect(transcoded).toEqual([mediaId]);
      // Followed again (a duplicate job), nothing happens twice.
      expect(await recordings.follow(mediaId)).toBe('done');
      expect(transcoded).toEqual([mediaId]);
    });

    it('hands a stored recording to the transcode once when two checks meet', async () => {
      const session = await live();
      await call('teacher', 'POST', `/${session.id}/recording`);
      const mediaId = (await pointer(session.id))!;
      recorder.states.set('EG_1', { state: 'stored', bytes: 4096 });
      stored.set(`recordings/${classId}/${mediaId}/original.mp4`, 4096);
      expect(
        await Promise.all([recordings.follow(mediaId), recordings.follow(mediaId)])
      ).toEqual(['done', 'done']);
      expect(transcoded).toEqual([mediaId]);
    });

    it('picks up again a recording whose check was lost, and only that one', async () => {
      // Checks are stamped by the database clock.
      now = new Date();
      const session = await live();
      await call('teacher', 'POST', `/${session.id}/recording`);
      const mediaId = (await pointer(session.id))!;
      followed = [];
      // Just started: its check is on its way.
      expect(await recordings.resume()).toBe(0);
      // Its check failed on a worker without the recording settings.
      await pool.query(
        `update media_items set updated_at = now() - interval '10 minutes' where id = $1`,
        [mediaId]
      );
      expect(await recordings.resume()).toBe(1);
      expect(followed).toEqual([mediaId]);
      // Followed again: not picked up a second time while that check runs.
      expect(await recordings.resume()).toBe(0);
      expect(await recordings.follow(mediaId)).toBe('running');
      expect(await recordings.resume()).toBe(0);
    });

    it('keeps a stored recording to be picked up again when the transcode cannot be queued', async () => {
      const session = await live();
      await call('teacher', 'POST', `/${session.id}/recording`);
      const mediaId = (await pointer(session.id))!;
      recorder.states.set('EG_1', { state: 'stored', bytes: 4096 });
      stored.set(`recordings/${classId}/${mediaId}/original.mp4`, 4096);
      let failTranscode = true;
      const retrying = new LiveRecordings({
        recordings: new PgLiveRecordingRepository(pool),
        media: new PgMediaRepository(pool),
        recorder,
        storage: {
          head: async (_bucket, key) =>
            stored.has(key) ? { size: stored.get(key)!, contentType: 'video/mp4' } : null,
        },
        follow: async () => undefined,
        transcode: async (id) => {
          if (failTranscode) throw new Error('queue unavailable');
          transcoded.push(id);
        },
        log: quiet,
        now: () => now,
      });
      await expect(retrying.follow(mediaId)).rejects.toThrow('queue unavailable');
      expect(await item(mediaId)).toMatchObject({ status: 'recording' });
      // The queue retries the check.
      failTranscode = false;
      expect(await retrying.follow(mediaId)).toBe('done');
      expect(await item(mediaId)).toMatchObject({ status: 'processing' });
      expect(transcoded).toEqual([mediaId]);
    });

    it('marks the recording failed when Egress gives up or the file is missing', async () => {
      const session = await live();
      await call('teacher', 'POST', `/${session.id}/recording`);
      const first = (await pointer(session.id))!;
      recorder.states.set('EG_1', {
        state: 'failed',
        error: 'Start signal not received',
      });
      expect(await recordings.follow(first)).toBe('done');
      expect(await item(first)).toMatchObject({
        status: 'failed',
        error: 'Start signal not received',
      });
      // The session is free to record again.
      expect(await pointer(session.id)).toBeNull();

      await call('teacher', 'POST', `/${session.id}/recording`);
      const second = (await pointer(session.id))!;
      recorder.states.set('EG_2', { state: 'stored', bytes: 10 });
      expect(await recordings.follow(second)).toBe('done');
      expect(await item(second)).toMatchObject({
        status: 'failed',
        error: 'the recording was not found in storage',
      });
      expect(transcoded).toEqual([]);
    });

    it('stops a recording still running after its session ran out', async () => {
      const session = await live();
      await call('teacher', 'POST', `/${session.id}/recording`);
      const mediaId = (await pointer(session.id))!;
      now = new Date(now.getTime() + 30 * 60_000);
      expect(await recordings.follow(mediaId)).toBe('running');
      expect(recorder.stopped).toEqual([]);
      // Planned 60 minutes, ended on its own an hour later.
      now = new Date(now.getTime() + 100 * 60_000);
      expect(await recordings.follow(mediaId)).toBe('running');
      expect(recorder.stopped).toEqual(['EG_1']);
    });
  });
});
