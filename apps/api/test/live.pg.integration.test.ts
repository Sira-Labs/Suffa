/**
 * Live lessons (ADR-0026) against Postgres: the teacher plans, starts and ends sessions; only
 * active members get a join token, only while a session is live; the teacher gives the floor;
 * every change is audit-logged; sisters' and brothers' sessions reach only their section; an
 * invite link to a session takes members to it and lets others ask to join the class. The
 * LiveKit server is a recording fake here (its own test:
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
import { PgLiveInviteRepository } from '../src/live/invites.js';
import { PgLiveSessionRepository, type LiveSession } from '../src/live/repository.js';
import {
  liveRoomSweep,
  MIN_TOKEN_SECONDS,
  PgLiveRoomSweepRepository,
} from '../src/live/lifetime.js';
import type { LiveParticipant, LiveRooms } from '../src/live/rooms.js';
import { loadMigrations, migrate } from '../src/migrate.js';
import { RateLimiter } from '../src/observability/tunnel.js';

const url = process.env.SUFFA_TEST_DATABASE_URL;
const quiet = { info: () => undefined, warn: () => undefined, error: () => undefined };

class FakeRooms implements LiveRooms {
  readonly url = 'wss://live.example.org';
  tokens: { room: string; who: LiveParticipant; ttl: number }[] = [];
  floor: { room: string; identity: string; allowed: boolean; camera: boolean }[] = [];
  hands: { room: string; identity: string; up: boolean }[] = [];
  /** Rooms the server reports as existing. */
  existing: string[] = [];
  closed: string[] = [];
  present = new Set<string>();
  async token(room: string, who: LiveParticipant, ttl: number) {
    this.tokens.push({ room, who, ttl });
    return `token-for-${who.identity}`;
  }
  async setFloor(
    room: string,
    identity: string,
    allowed: boolean,
    { camera }: { camera: boolean }
  ) {
    if (!this.present.has(identity)) return false;
    this.floor.push({ room, identity, allowed, camera });
    return true;
  }
  async setHand(room: string, identity: string, up: boolean) {
    if (!this.present.has(identity)) return false;
    this.hands.push({ room, identity, up });
    return true;
  }
  async list() {
    return this.existing;
  }
  async close(room: string) {
    this.closed.push(room);
  }
}

describe.skipIf(!url)('Live lessons (Postgres)', () => {
  let pool: pg.Pool;
  let rooms: FakeRooms;
  let now = new Date('2026-10-13T16:00:00.000Z');
  /** Hand changes per person and minute in these tests, and the limiter's clock. */
  const HAND_LIMIT = 4;
  let handClock = 0;
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
        invites: {
          repo: new PgLiveInviteRepository(pool, () => now),
          publicUrl: 'https://suffa.example.org',
        },
        auth: {
          actor: async (h) => users[h.get('x-test-user') ?? ''] ?? null,
        } satisfies AuthResolver,
        log: quiet,
        now: () => now,
        handLimiter: () => new RateLimiter(HAND_LIMIT, 60_000, () => handClock),
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

  /** A request outside the class's live path, e.g. an invite link. */
  const api = (who: string | undefined, method: string, path: string) =>
    apps.on.request(`/api/v1${path}`, {
      method,
      headers: who ? { 'x-test-user': who } : {},
    });

  /** An invite link for the session, and its token. */
  const invite = async (session: LiveSession) => {
    const res = await call('teacher', 'POST', `/${session.id}/invite`);
    expect(res.status).toBe(201);
    const body = (await res.json()) as { url: string; expiresAt: string };
    return { ...body, token: body.url.split('/').at(-1)! };
  };

  const plan = async (title = 'Lektion 5', startsAt = now, extra: object = {}) => {
    const res = await call('teacher', 'POST', '', {
      title,
      startsAt: startsAt.toISOString(),
      durationMinutes: 60,
      ...extra,
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
      status = 'active',
      section: string | null = null
    ) => {
      const id = randomUUID();
      await pool.query(
        'insert into users (id, email, name, role) values ($1, $2, $3, $4)',
        [id, `${name}@example.org`, name, role]
      );
      users[name] = { id, role };
      if (classRole) {
        await pool.query(
          `insert into class_members (class_id, user_id, class_role, status, section)
           values ($1, $2, $3, $4, $5)`,
          [classId, id, classRole, status, section]
        );
      }
    };
    await add('teacher', 'teacher', 'teacher');
    await add('learner', 'student', 'student');
    await add('waiting', 'student', 'student', 'pending');
    await add('outsider', 'student', null);
    await add('sister', 'student', 'student', 'active', 'sisters');
    await add('brother', 'student', 'student', 'active', 'brothers');
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
    // The learner may turn on their own camera: the session allows learner cameras.
    expect(
      rooms.tokens.map((t) => [t.room, t.who.name, t.who.role, t.who.camera, t.ttl])
    ).toEqual([
      [`live-${session.id}`, 'teacher', 'teacher', false, 120 * 60],
      [`live-${session.id}`, 'learner', 'learner', true, 120 * 60],
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
    expect(rooms.floor.map((f) => [f.allowed, f.camera])).toEqual([
      [true, true],
      [false, true],
    ]);

    // Only learners of the class: the teacher's own rights and outsiders are never touched.
    for (const who of ['teacher', 'outsider', 'waiting']) {
      rooms.present.add(users[who]!.id);
      const res = await call('teacher', 'POST', `/${session.id}/floor`, {
        identity: users[who]!.id,
        allowed: true,
      });
      expect(await res.json(), who).toEqual({ error: 'not_in_room' });
    }
    expect(rooms.floor).toHaveLength(2);
  });

  it('lets a learner in the room raise and lower their own hand, nobody else', async () => {
    const session = await plan();
    const hand = (who: string, body: unknown = { up: true }, id = session.id) =>
      call(who, 'POST', `/${id}/hand`, body);
    expect(await (await hand('learner')).json()).toEqual({ error: 'not_live' });
    await call('teacher', 'POST', `/${session.id}/start`);

    const learner = users.learner!.id;
    expect(await (await hand('learner')).json()).toEqual({ error: 'not_in_room' });
    rooms.present.add(learner);
    expect((await hand('learner')).status).toBe(204);
    expect((await hand('learner', { up: false })).status).toBe(204);
    expect(rooms.hands.filter((h) => h.room === `live-${session.id}`)).toEqual([
      { room: `live-${session.id}`, identity: learner, up: true },
      { room: `live-${session.id}`, identity: learner, up: false },
    ]);

    // The hand is always the caller's own: there is no identity to name another person.
    expect(
      (await hand('learner', { up: true, identity: users.teacher!.id })).status
    ).toBe(400);
    expect((await hand('learner', { up: 'yes' })).status).toBe(400);
    // Teachers do not raise hands; pending members and outsiders are not in the class.
    rooms.present.add(users.teacher!.id);
    expect(await (await hand('teacher')).json()).toEqual({ error: 'not_in_room' });
    expect((await hand('waiting')).status).toBe(403);
    expect((await hand('outsider')).status).toBe(403);
    expect(rooms.hands.filter((h) => h.room === `live-${session.id}`)).toHaveLength(2);
  });

  it('limits how often one person changes their hand, each person by themselves', async () => {
    const session = await plan();
    await call('teacher', 'POST', `/${session.id}/start`);
    const learner = users.learner!.id;
    rooms.present.add(learner);
    const hand = (who: string, up: boolean) =>
      call(who, 'POST', `/${session.id}/hand`, { up });
    const reached = () => rooms.hands.filter((h) => h.room === `live-${session.id}`);

    // Calls that never reach the room do not use the limit up.
    expect((await call('learner', 'POST', `/${session.id}/hand`, {})).status).toBe(400);
    for (let i = 0; i < HAND_LIMIT; i += 1) {
      expect((await hand('learner', i % 2 === 0)).status).toBe(204);
    }
    const refused = await hand('learner', true);
    expect(refused.status).toBe(429);
    expect(await refused.json()).toEqual({ error: 'rate_limited' });
    expect(reached()).toHaveLength(HAND_LIMIT);

    // Another learner in the room is not held back by it.
    rooms.present.add(users.sister!.id);
    expect((await hand('sister', true)).status).toBe(204);

    // A minute later the first one may again.
    handClock += 60_000;
    expect((await hand('learner', true)).status).toBe(204);
    expect(reached()).toHaveLength(HAND_LIMIT + 2);
  });

  it('shows sisters and brothers only their own sessions and those for everyone', async () => {
    const all = await plan('Alle');
    const sisters = await plan('Schwestern', now, { audience: 'sisters' });
    const brothers = await plan('Brüder', now, { audience: 'brothers' });
    const titles = async (who: string) =>
      (
        (await (await call(who, 'GET', '')).json()) as { sessions: LiveSession[] }
      ).sessions
        .map((s) => s.title)
        .sort();

    expect(await titles('teacher')).toEqual(['Alle', 'Brüder', 'Schwestern']);
    expect(await titles('sister')).toEqual(['Alle', 'Schwestern']);
    expect(await titles('brother')).toEqual(['Alle', 'Brüder']);
    // Not assigned yet: only sessions for everyone.
    expect(await titles('learner')).toEqual(['Alle']);

    // The sisters and the brothers meet at the same time, next to a session for everyone.
    for (const session of [all, sisters, brothers]) {
      expect((await call('teacher', 'POST', `/${session.id}/start`)).status).toBe(200);
    }
    expect((await call('sister', 'POST', `/${sisters.id}/join`)).status).toBe(200);
    expect((await call('sister', 'POST', `/${all.id}/join`)).status).toBe(200);
    const wrong = await call('brother', 'POST', `/${sisters.id}/join`);
    expect(wrong.status).toBe(403);
    expect(await wrong.json()).toEqual({ error: 'wrong_audience' });
    // Nor can a brother raise a hand in the sisters' room.
    rooms.present.add(users.brother!.id);
    const hand = await call('brother', 'POST', `/${sisters.id}/hand`, { up: true });
    expect(await hand.json()).toEqual({ error: 'wrong_audience' });
    expect(rooms.hands.filter((h) => h.room === `live-${sisters.id}`)).toEqual([]);
    expect((await call('learner', 'POST', `/${brothers.id}/join`)).status).toBe(403);
    expect(
      await (await call('teacher', 'POST', `/${brothers.id}/join`)).json()
    ).toMatchObject({ role: 'teacher' });
    const another = await plan('Noch einmal', now, { audience: 'sisters' });
    expect(await (await call('teacher', 'POST', `/${another.id}/start`)).json()).toEqual({
      error: 'already_live',
    });
  });

  it('gives learners only their voice when cameras stay off', async () => {
    const session = await plan('Ohne Kameras', now, {
      audience: 'sisters',
      learnerCameras: false,
    });
    expect(session).toMatchObject({ audience: 'sisters', learnerCameras: false });
    await call('teacher', 'POST', `/${session.id}/start`);
    expect((await call('sister', 'POST', `/${session.id}/join`)).status).toBe(200);
    expect(rooms.tokens.at(-1)?.who).toMatchObject({ role: 'learner', camera: false });
    rooms.present.add(users.sister!.id);
    const res = await call('teacher', 'POST', `/${session.id}/floor`, {
      identity: users.sister!.id,
      allowed: true,
    });
    expect(res.status).toBe(204);
    expect(rooms.floor).toEqual([
      {
        room: `live-${session.id}`,
        identity: users.sister!.id,
        allowed: true,
        camera: false,
      },
    ]);
    const invalid = { title: 'x', startsAt: now.toISOString(), durationMinutes: 60 };
    for (const extra of [{ audience: 'cousins' }, { learnerCameras: 'no' }]) {
      expect((await call('teacher', 'POST', '', { ...invalid, ...extra })).status).toBe(
        400
      );
    }
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

  it('sweeps: ends sessions left live and closes every room whose session is not live', async () => {
    const sweep = liveRoomSweep(new PgLiveRoomSweepRepository(pool), rooms);
    const forgotten = await plan('Vergessen');
    const ended = await plan('Beendet', now, { audience: 'sisters' });
    const planned = await plan('Geplant', new Date(now.getTime() + 3_600_000), {
      audience: 'brothers',
    });
    await call('teacher', 'POST', `/${forgotten.id}/start`);
    await call('teacher', 'POST', `/${ended.id}/start`);
    await call('teacher', 'POST', `/${ended.id}/end`);
    const room = (s: LiveSession) => `live-${s.id}`;
    const closedNow = () => [...rooms.closed].sort();

    // The room of the ended session is back (a late token), the forgotten one is in use,
    // one belongs to a session that never started, and two are not ours at all.
    rooms.existing = [
      room(forgotten),
      room(ended),
      room(planned),
      'live-not-a-session',
      'someone-elses-room',
    ];
    rooms.closed = [];
    expect(await sweep.run(now)).toEqual({ ended: 0, closed: 2 });
    expect(closedNow()).toEqual([room(ended), room(planned)].sort());

    // Two hours and a minute later nobody has looked at the class: the forgotten session is
    // ended and its room closed in the same sweep.
    const later = new Date(now.getTime() + 121 * 60_000);
    rooms.existing = [room(forgotten), 'someone-elses-room'];
    rooms.closed = [];
    expect(await sweep.run(later)).toEqual({ ended: 1, closed: 1 });
    expect(closedNow()).toEqual([room(forgotten)]);
    const { rows } = await pool.query(
      'select status from live_sessions where id = any($1)',
      [[forgotten.id, ended.id, planned.id]]
    );
    expect(rows.map((r) => r.status).sort()).toEqual(['ended', 'ended', 'scheduled']);
    // The end is on record, with no person as its actor.
    const audit = await pool.query(
      `select actor_id, target_id, details from audit_log
        where action = 'live.session_overrun_ended'`
    );
    expect(audit.rows).toEqual([
      {
        actor_id: null,
        target_id: forgotten.id,
        details: {
          classId,
          title: 'Vergessen',
          startsAt: forgotten.startsAt,
          audience: 'all',
        },
      },
    ]);

    // However much later a room of an ended session turns up, it is closed; with no rooms
    // there is nothing to do.
    rooms.existing = [room(ended)];
    rooms.closed = [];
    const muchLater = new Date(now.getTime() + 48 * 3_600_000);
    expect(await sweep.run(muchLater)).toEqual({ ended: 0, closed: 1 });
    rooms.existing = [];
    expect(await sweep.run(muchLater)).toEqual({ ended: 0, closed: 0 });
  });

  it('ends a session left live an hour past its planned length', async () => {
    const session = await plan();
    await call('teacher', 'POST', `/${session.id}/start`);
    // A token lasts until the session is over at the latest, whenever someone joins.
    now = new Date(now.getTime() + 30 * 60_000);
    expect((await call('learner', 'POST', `/${session.id}/join`)).status).toBe(200);
    expect(rooms.tokens.at(-1)!.ttl).toBe(90 * 60);
    now = new Date(now.getTime() + 89 * 60_000);
    expect((await call('learner', 'POST', `/${session.id}/join`)).status).toBe(200);
    // One minute is left: long enough to connect, never shorter.
    expect(rooms.tokens.at(-1)!.ttl).toBe(MIN_TOKEN_SECONDS);
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
    const hand = await call(
      'learner',
      'POST',
      `/${session.id}/hand`,
      { up: true },
      apps.off
    );
    expect(hand.status).toBe(503);
  });

  describe('invite links to a session', () => {
    it('takes members to the session and lets anyone else ask to join the class', async () => {
      const session = await plan();
      expect((await call('learner', 'POST', `/${session.id}/invite`)).status).toBe(403);
      const link = await invite(session);
      expect(link.url).toMatch(/^https:\/\/suffa\.example\.org\/live-invite\/[\w-]{32}$/);
      // A planned session's link holds as long as the session is listed.
      expect(link.expiresAt).toBe('2026-10-14T05:00:00.000Z');

      const preview = await api('outsider', 'GET', `/live-invites/${link.token}`);
      expect(preview.status).toBe(200);
      expect(await preview.json()).toEqual({
        classId,
        className: 'Arabisch 1a',
        teacherName: null,
        sessionId: session.id,
        title: 'Lektion 5',
        startsAt: session.startsAt,
        status: 'scheduled',
      });
      expect((await api(undefined, 'GET', `/live-invites/${link.token}`)).status).toBe(
        401
      );

      const asked = await api('outsider', 'POST', `/live-invites/${link.token}/join`);
      expect(await asked.json()).toEqual({
        classId,
        sessionId: session.id,
        status: 'pending',
      });
      const member = await pool.query(
        'select status, class_role from class_members where user_id = $1',
        [users.outsider!.id]
      );
      expect(member.rows).toEqual([{ status: 'pending', class_role: 'student' }]);
      // Pending, so not in the room yet.
      expect((await call('outsider', 'POST', `/${session.id}/join`)).status).toBe(403);

      // Members keep their membership as it is.
      for (const [who, status] of [
        ['learner', 'active'],
        ['teacher', 'active'],
        ['waiting', 'pending'],
      ] as const) {
        const res = await api(who, 'POST', `/live-invites/${link.token}/join`);
        expect(await res.json()).toMatchObject({ status });
      }
      const teacherRole = await pool.query(
        'select class_role from class_members where user_id = $1',
        [users.teacher!.id]
      );
      expect(teacherRole.rows).toEqual([{ class_role: 'teacher' }]);

      const audit = await pool.query(
        `select action, details from audit_log
          where action in ('live.invite_created', 'class.join_requested') order by id`
      );
      expect(audit.rows).toEqual([
        { action: 'live.invite_created', details: { classId } },
        {
          action: 'class.join_requested',
          details: { via: 'live_invite', sessionId: session.id },
        },
      ]);
    });

    it("replaces a session's link with a new one and leaves the class link alone", async () => {
      const session = await plan();
      const classLink = await pool.query(
        `insert into class_invites (token_hash, class_id, created_by, expires_at)
         values ('class-link', $1, $2, $3) returning token_hash`,
        [classId, users.teacher!.id, new Date(now.getTime() + 86_400_000)]
      );
      const first = await invite(session);
      const second = await invite(session);
      expect((await api('outsider', 'GET', `/live-invites/${first.token}`)).status).toBe(
        404
      );
      expect((await api('outsider', 'GET', `/live-invites/${second.token}`)).status).toBe(
        200
      );
      const still = await pool.query(
        'select revoked_at from class_invites where token_hash = $1',
        [classLink.rows[0].token_hash]
      );
      expect(still.rows).toEqual([{ revoked_at: null }]);
    });

    it('stops working once the session is over', async () => {
      const ended = await plan();
      const endedLink = await invite(ended);
      await call('teacher', 'POST', `/${ended.id}/start`);
      // While live, the link holds until the end plus the hour of overrun.
      const live = await api('learner', 'GET', `/live-invites/${endedLink.token}`);
      expect(await live.json()).toMatchObject({ status: 'live' });
      await call('teacher', 'POST', `/${ended.id}/end`);
      for (const [method, path] of [
        ['GET', `/live-invites/${endedLink.token}`],
        ['POST', `/live-invites/${endedLink.token}/join`],
      ] as const) {
        const res = await api('outsider', method, path);
        expect(res.status).toBe(404);
        expect(await res.json()).toEqual({ error: 'invalid_invite' });
      }
      expect((await call('teacher', 'POST', `/${ended.id}/invite`)).status).toBe(404);

      // A planned session that never started: no longer listed, no longer invited to.
      const missed = await plan('Lektion 6', new Date(now.getTime() + 60_000));
      const missedLink = await invite(missed);
      now = new Date(now.getTime() + (1 + 60 + 12 * 60) * 60_000 + 60_000);
      expect(
        (await api('outsider', 'GET', `/live-invites/${missedLink.token}`)).status
      ).toBe(404);
      expect((await api('outsider', 'GET', '/live-invites/not-a-token')).status).toBe(
        404
      );
    });
  });
});
