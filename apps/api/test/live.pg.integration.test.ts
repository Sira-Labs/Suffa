/**
 * Live lessons (ADR-0026) against Postgres: the teacher plans, starts and ends sessions; only
 * active members get a join token, only while a session is live; the teacher gives the floor;
 * every change is audit-logged. The LiveKit server is a recording fake here (its own test:
 * livekit.integration.test.ts).
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
import { PgLiveSessionRepository, type LiveSession } from '../src/live/repository.js';
import type { LiveParticipant, LiveRooms } from '../src/live/rooms.js';
import { loadMigrations, migrate } from '../src/migrate.js';

const url = process.env.SUFFA_TEST_DATABASE_URL;
const quiet = { info: () => undefined, warn: () => undefined, error: () => undefined };

class FakeRooms implements LiveRooms {
  readonly url = 'wss://live.example.org';
  tokens: { room: string; who: LiveParticipant; ttl: number }[] = [];
  floor: { room: string; identity: string; allowed: boolean }[] = [];
  closed: string[] = [];
  present = new Set<string>();
  async token(room: string, who: LiveParticipant, ttl: number) {
    this.tokens.push({ room, who, ttl });
    return `token-for-${who.identity}`;
  }
  async setFloor(room: string, identity: string, allowed: boolean) {
    if (!this.present.has(identity)) return false;
    this.floor.push({ room, identity, allowed });
    return true;
  }
  async close(room: string) {
    this.closed.push(room);
  }
}

describe.skipIf(!url)('Live lessons (Postgres)', () => {
  let pool: pg.Pool;
  let rooms: FakeRooms;
  let now = new Date('2026-10-13T16:00:00.000Z');
  let classId: string;
  const users: Record<string, { id: string; role: Role }> = {};
  const apps: Record<'on' | 'off', ReturnType<typeof createApp>> = {} as never;

  const build = (withRooms: boolean) =>
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
        rooms: withRooms ? rooms : undefined,
        auth: {
          actor: async (h) => users[h.get('x-test-user') ?? ''] ?? null,
        } satisfies AuthResolver,
        log: quiet,
        now: () => now,
      },
    });

  const call = (
    who: string | undefined,
    method: string,
    path: string,
    body?: unknown,
    app: ReturnType<typeof createApp> = apps.on
  ) =>
    app.request(`/api/v1/classes/${classId}/live${path}`, {
      method,
      headers: {
        ...(who ? { 'x-test-user': who } : {}),
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

  const plan = async (title = 'Lektion 5', startsAt = now) => {
    const res = await call('teacher', 'POST', '', {
      title,
      startsAt: startsAt.toISOString(),
      durationMinutes: 60,
    });
    expect(res.status).toBe(201);
    return ((await res.json()) as { session: LiveSession }).session;
  };

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: url, max: 4 });
    await pool.query('drop schema public cascade; create schema public');
    await migrate(
      pool,
      await loadMigrations(join(import.meta.dirname, '..', 'migrations')),
      quiet
    );
    rooms = new FakeRooms();
    apps.on = build(true);
    apps.off = build(false);
  });

  beforeEach(async () => {
    now = new Date('2026-10-13T16:00:00.000Z');
    rooms.tokens = [];
    rooms.floor = [];
    rooms.closed = [];
    rooms.present.clear();
    await pool.query('truncate users, classes, audit_log cascade');
    classId = randomUUID();
    await pool.query("insert into classes (id, name) values ($1, 'Arabisch 1a')", [
      classId,
    ]);
    const add = async (
      name: string,
      role: Role,
      classRole: string | null,
      status = 'active'
    ) => {
      const id = randomUUID();
      await pool.query(
        'insert into users (id, email, name, role) values ($1, $2, $3, $4)',
        [id, `${name}@example.org`, name, role]
      );
      users[name] = { id, role };
      if (classRole) {
        await pool.query(
          `insert into class_members (class_id, user_id, class_role, status)
           values ($1, $2, $3, $4)`,
          [classId, id, classRole, status]
        );
      }
    };
    await add('teacher', 'teacher', 'teacher');
    await add('learner', 'student', 'student');
    await add('waiting', 'student', 'student', 'pending');
    await add('outsider', 'student', null);
  });

  afterAll(async () => {
    await pool?.end();
  });

  it('lets the teacher plan sessions that the class sees, soonest first', async () => {
    await plan('Später', new Date('2026-10-14T16:00:00.000Z'));
    await plan('Heute');
    const res = await call('learner', 'GET', '');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { enabled: boolean; sessions: LiveSession[] };
    expect(body.enabled).toBe(true);
    expect(body.sessions.map((s) => [s.title, s.status])).toEqual([
      ['Heute', 'scheduled'],
      ['Später', 'scheduled'],
    ]);
    // Learners plan nothing; pending members and outsiders see nothing.
    expect(
      (
        await call('learner', 'POST', '', {
          title: 'x',
          startsAt: now.toISOString(),
          durationMinutes: 30,
        })
      ).status
    ).toBe(403);
    expect((await call('waiting', 'GET', '')).status).toBe(403);
    expect((await call('outsider', 'GET', '')).status).toBe(403);
    expect((await call(undefined, 'GET', '')).status).toBe(401);
  });

  it('refuses invalid plans', async () => {
    for (const body of [
      { title: '', startsAt: now.toISOString(), durationMinutes: 60 },
      { title: 'x', startsAt: 'morgen', durationMinutes: 60 },
      { title: 'x', startsAt: now.toISOString(), durationMinutes: 5 },
      { title: 'x', startsAt: now.toISOString(), durationMinutes: 60, extra: true },
    ]) {
      expect((await call('teacher', 'POST', '', body)).status, JSON.stringify(body)).toBe(
        400
      );
    }
    const tooLate = await call('teacher', 'POST', '', {
      title: 'x',
      startsAt: '2028-01-01T10:00:00.000Z',
      durationMinutes: 60,
    });
    expect(await tooLate.json()).toEqual({ error: 'invalid_start' });
  });

  it('gives tokens only while live: the teacher moderates, the learner listens', async () => {
    const session = await plan();
    expect((await call('learner', 'POST', `/${session.id}/join`)).status).toBe(409);

    const started = await call('teacher', 'POST', `/${session.id}/start`);
    expect(((await started.json()) as { session: LiveSession }).session.status).toBe(
      'live'
    );

    const asTeacher = await call('teacher', 'POST', `/${session.id}/join`);
    expect(await asTeacher.json()).toMatchObject({
      url: 'wss://live.example.org',
      token: `token-for-${users.teacher!.id}`,
      role: 'teacher',
    });
    const asLearner = await call('learner', 'POST', `/${session.id}/join`);
    expect(await asLearner.json()).toMatchObject({ role: 'learner' });
    expect(rooms.tokens.map((t) => [t.room, t.who.name, t.who.role, t.ttl])).toEqual([
      [`live-${session.id}`, 'teacher', 'teacher', 120 * 60],
      [`live-${session.id}`, 'learner', 'learner', 120 * 60],
    ]);
    expect((await call('waiting', 'POST', `/${session.id}/join`)).status).toBe(403);
    expect((await call('outsider', 'POST', `/${session.id}/join`)).status).toBe(403);
  });

  it('lets the teacher give and take the floor of learners in the room', async () => {
    const session = await plan();
    await call('teacher', 'POST', `/${session.id}/start`);
    const learner = users.learner!.id;
    const floor = (allowed: boolean, who = 'teacher') =>
      call(who, 'POST', `/${session.id}/floor`, { identity: learner, allowed });

    expect(await (await floor(true)).json()).toEqual({ error: 'not_in_room' });
    rooms.present.add(learner);
    expect((await floor(true)).status).toBe(204);
    expect((await floor(false)).status).toBe(204);
    expect((await floor(true, 'learner')).status).toBe(403);
    expect(rooms.floor.map((f) => f.allowed)).toEqual([true, false]);
  });

  it('keeps one live session per class, ends it and closes its room', async () => {
    const first = await plan('Erste');
    const second = await plan('Zweite');
    await call('teacher', 'POST', `/${first.id}/start`);
    expect(await (await call('teacher', 'POST', `/${second.id}/start`)).json()).toEqual({
      error: 'already_live',
    });
    const ended = await call('teacher', 'POST', `/${first.id}/end`);
    expect(((await ended.json()) as { session: LiveSession }).session.status).toBe(
      'ended'
    );
    expect(rooms.closed).toEqual([`live-${first.id}`]);
    expect((await call('teacher', 'POST', `/${first.id}/end`)).status).toBe(409);
    expect((await call('teacher', 'POST', `/${second.id}/start`)).status).toBe(200);

    const { rows } = await pool.query<{ action: string; actor_id: string }>(
      `select action, actor_id from audit_log where target_type = 'live_session' order by id`
    );
    expect(rows.map((r) => r.action)).toEqual([
      'live.session_created',
      'live.session_created',
      'live.session_started',
      'live.session_ended',
      'live.session_started',
    ]);
    expect(new Set(rows.map((r) => r.actor_id))).toEqual(new Set([users.teacher!.id]));
  });

  it('cancels only planned sessions', async () => {
    const session = await plan();
    const other = await plan('Andere');
    expect((await call('teacher', 'DELETE', `/${session.id}`)).status).toBe(204);
    expect((await call('teacher', 'DELETE', `/${session.id}`)).status).toBe(404);
    await call('teacher', 'POST', `/${other.id}/start`);
    expect((await call('teacher', 'DELETE', `/${other.id}`)).status).toBe(409);
  });

  it('ends a session left live an hour past its planned length', async () => {
    const session = await plan();
    await call('teacher', 'POST', `/${session.id}/start`);
    now = new Date(now.getTime() + 119 * 60_000);
    expect((await call('learner', 'POST', `/${session.id}/join`)).status).toBe(200);
    now = new Date(now.getTime() + 2 * 60_000);
    expect((await call('learner', 'POST', `/${session.id}/join`)).status).toBe(409);
    const list = (await (await call('learner', 'GET', '')).json()) as {
      sessions: LiveSession[];
    };
    expect(list.sessions).toEqual([]);
  });

  it('lists sessions as off and lets nobody start or join without a LiveKit server', async () => {
    const session = await plan();
    const list = await call('learner', 'GET', '', undefined, apps.off);
    expect(await list.json()).toMatchObject({ enabled: false });
    const start = await call(
      'teacher',
      'POST',
      `/${session.id}/start`,
      undefined,
      apps.off
    );
    expect(start.status).toBe(503);
    expect(await start.json()).toEqual({ error: 'live_unavailable' });
  });
});
