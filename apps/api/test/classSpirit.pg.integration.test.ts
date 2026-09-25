/**
 * Class dashboard and class spirit against a real Postgres (stories 6.1, 6.2): scoping,
 * aggregates, the weekly challenge with its class badge, teacher badges and shout-outs.
 * Run with SUFFA_TEST_DATABASE_URL; the database is wiped.
 */
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { AuthResolver } from '../src/auth/resolver.js';
import type { Role } from '../src/authz/policies.js';
import { PgClassProgressRepository } from '../src/classes/progress.js';
import { PgClassRepository } from '../src/classes/repository.js';
import { PgClassLeagueRepository } from '../src/classes/league.js';
import { PgClassSpiritRepository } from '../src/classes/spirit.js';
import { loadMigrations, migrate } from '../src/migrate.js';
import { PgSyncRepository } from '../src/sync/repository.js';

const url = process.env.SUFFA_TEST_DATABASE_URL;
const quiet = { info: () => undefined, warn: () => undefined, error: () => undefined };
// A Wednesday; the week starts on Monday 2026-09-21.
const NOW = new Date('2026-09-23T12:00:00.000Z');

describe.skipIf(!url)('Class dashboard and spirit (Postgres)', () => {
  let pool: pg.Pool;
  let app: ReturnType<typeof createApp>;
  let classId: string;
  const users: Record<string, { id: string; role: Role }> = {};

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
    await pool.query('truncate users, classes, audit_log cascade');
    for (const [name, role] of [
      ['teacher', 'teacher'],
      ['other', 'teacher'],
      ['amina', 'student'],
      ['bilal', 'student'],
      ['waiting', 'student'],
    ] as const) {
      const id = randomUUID();
      await pool.query(
        'insert into users (id, email, name, role) values ($1, $2, $3, $4)',
        [id, `${name}@example.org`, name === 'amina' ? 'Amina' : '', role]
      );
      users[name] = { id, role };
    }
    classId = randomUUID();
    await pool.query("insert into classes (id, name) values ($1, 'Arabisch 1a')", [
      classId,
    ]);
    const member = (user: string, classRole: string, status = 'active') =>
      pool.query(
        'insert into class_members (class_id, user_id, class_role, status) values ($1, $2, $3, $4)',
        [classId, users[user]!.id, classRole, status]
      );
    await member('teacher', 'teacher');
    await member('amina', 'student');
    await member('bilal', 'student');
    await member('waiting', 'student', 'pending');

    const auth: AuthResolver = {
      actor: async (h) => users[h.get('x-test-user') ?? ''] ?? null,
    };
    const classes = new PgClassRepository(pool, () => NOW);
    app = createApp({
      version: 'test',
      expectedRevision: null,
      health: {
        schemaRevision: async () => null,
        queueDepth: async () => ({ waiting: 0, active: 0, failed: 0, deadLetter: 0 }),
      },
      classSpirit: {
        classes,
        progress: new PgClassProgressRepository(pool, () => NOW),
        spirit: new PgClassSpiritRepository(pool, () => NOW),
        league: new PgClassLeagueRepository(pool, () => NOW),
        auth,
        log: quiet,
      },
    });
  });

  afterAll(async () => {
    await pool?.end();
  });

  const call = (who: string, method: string, path: string, body?: unknown) =>
    app.request(`/api/v1/classes/${classId}${path}`, {
      method,
      headers: { 'x-test-user': who, 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

  const reviewsFor = async (user: string, n: number, at: string) => {
    const t0 = Date.parse(at);
    await new PgSyncRepository(pool).upsert(
      users[user]!.id,
      'review_logs',
      Array.from({ length: n }, (_, i) => {
        const reviewedAt = new Date(t0 + i * 10_000).toISOString();
        return {
          id: `${user}-${i}`,
          cardId: `c${i}`,
          contentRef: `v${i}`,
          kind: 'vocab_ar_de',
          rating: 'good',
          durationMs: 3000,
          scheduledInterval: 1,
          reviewedAt,
          updated_at: reviewedAt,
          deleted: false,
        };
      })
    );
  };

  it('shows the teacher aggregates of active learners only', async () => {
    await reviewsFor('amina', 3, '2026-09-22T08:00:00.000Z');
    await new PgSyncRepository(pool).upsert(users.amina!.id, 'srs_cards', [
      {
        id: 'vocab_ar_de:v-kitab',
        contentRef: 'v-kitab',
        kind: 'vocab_ar_de',
        interval: 30,
        ease: 2.5,
        reps: 5,
        lapses: 0,
        due: '2026-10-20T00:00:00.000Z',
        lastReviewed: '2026-09-20T00:00:00.000Z',
        leech: true,
        updated_at: '2026-09-20T00:00:00.000Z',
        deleted: false,
      },
    ]);
    const response = await call('teacher', 'GET', '/progress');
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      students: {
        name: string | null;
        lastActiveAt: string | null;
        matureWords: number;
      }[];
      matureByRef: Record<string, number>;
      leeches: { contentRef: string; learners: number }[];
    };
    expect(body.students.map((s) => s.name)).toEqual(['Amina', null]);
    expect(body.students[0]).toMatchObject({
      lastActiveAt: '2026-09-22T08:00:20.000Z',
      matureWords: 1,
    });
    expect(body.matureByRef).toEqual({ 'v-kitab': 1 });
    expect(body.leeches).toEqual([{ contentRef: 'v-kitab', learners: 1 }]);
    // Other teachers and learners get nothing.
    expect((await call('other', 'GET', '/progress')).status).toBe(403);
    expect((await call('amina', 'GET', '/progress')).status).toBe(403);
  });

  it('runs a weekly challenge and gives helpers the class badge when it is reached', async () => {
    const set = await call('teacher', 'PUT', '/challenge', {
      template: 'reviews',
      target: 5,
      timeZone: 'Europe/Zurich',
    });
    expect(await set.json()).toMatchObject({
      template: 'reviews',
      weekStart: '2026-09-21',
      progress: 0,
      reached: false,
      yours: null,
    });
    expect(
      (
        await call('amina', 'PUT', '/challenge', {
          template: 'xp',
          target: 1,
          timeZone: 'UTC',
        })
      ).status
    ).toBe(403);

    await reviewsFor('amina', 3, '2026-09-22T08:00:00.000Z');
    // Last week's reviews do not count.
    await reviewsFor('bilal', 4, '2026-09-19T08:00:00.000Z');
    let feed = (await (await call('amina', 'GET', '/feed')).json()) as {
      challenge: { progress: number; reached: boolean; yours: number };
    };
    expect(feed.challenge).toMatchObject({ progress: 3, reached: false, yours: 3 });

    await reviewsFor('bilal', 2, '2026-09-23T07:00:00.000Z');
    feed = (await (await call('bilal', 'GET', '/feed')).json()) as typeof feed;
    expect(feed.challenge).toMatchObject({ progress: 5, reached: true, yours: 2 });
    const unlocks = await pool.query(
      "select user_id from achievement_unlocks where badge_id = 'ruh' order by user_id"
    );
    expect(unlocks.rows.map((r) => r.user_id).sort()).toEqual(
      [users.amina!.id, users.bilal!.id].sort()
    );
    // A pending learner cannot read the feed yet.
    expect((await call('waiting', 'GET', '/feed')).status).toBe(403);
    // A reached challenge stays; it cannot be removed.
    expect((await call('teacher', 'DELETE', '/challenge')).status).toBe(404);
  });

  it('awards teacher badges and posts shout-outs only within the class', async () => {
    const created = await call('teacher', 'POST', '/badges', {
      name: 'Fleißige Biene',
      icon: 'award',
      message: 'Jeden Tag dabei',
    });
    expect(created.status).toBe(201);
    const badge = (await created.json()) as { id: string };
    const award = (who: string) =>
      call('teacher', 'POST', `/badges/${badge.id}/awards`, { userId: users[who]!.id });
    expect((await award('amina')).status).toBe(204);
    expect((await award('amina')).status).toBe(204); // twice is fine
    expect((await award('waiting')).status).toBe(404);
    expect((await award('other')).status).toBe(404);
    expect(
      (await call('teacher', 'POST', '/badges', { name: 'x', icon: 'rocket' })).status
    ).toBe(400);

    const shout = await call('teacher', 'POST', '/shoutouts', {
      message: 'Māshā’ Allāh, Amina!',
      userId: users.amina!.id,
    });
    expect(shout.status).toBe(201);
    expect(
      (
        await call('teacher', 'POST', '/shoutouts', {
          message: 'Hallo',
          userId: users.other!.id,
        })
      ).status
    ).toBe(404);
    await call('teacher', 'POST', '/shoutouts', { message: 'Schöne Woche allen!' });

    const feed = (await (await call('amina', 'GET', '/feed')).json()) as {
      shoutouts: { message: string; to: string | null; toYou: boolean }[];
      badges: { name: string; awards: { name: string | null; you: boolean }[] }[];
    };
    expect(feed.shoutouts.map((s) => [s.message, s.to, s.toYou])).toEqual([
      ['Schöne Woche allen!', null, false],
      ['Māshā’ Allāh, Amina!', 'Amina', true],
    ]);
    expect(feed.badges).toEqual([
      expect.objectContaining({
        name: 'Fleißige Biene',
        awards: [expect.objectContaining({ name: 'Amina', you: true })],
      }),
    ]);
    const { id } = (await shout.json()) as { id: string };
    expect((await call('teacher', 'DELETE', `/shoutouts/${id}`)).status).toBe(204);
    expect((await call('teacher', 'DELETE', `/shoutouts/${id}`)).status).toBe(404);
    const audit = await pool.query(
      "select action from audit_log where action like 'class.%' order by id"
    );
    expect(audit.rows.map((r) => r.action)).toEqual([
      'class.badge_created',
      'class.badge_awarded',
      'class.shoutout',
      'class.shoutout',
      'class.shoutout_removed',
    ]);
  });

  it('lets the teacher change or remove an open challenge', async () => {
    const put = (target: number) =>
      call('teacher', 'PUT', '/challenge', { template: 'xp', target, timeZone: 'UTC' });
    expect((await put(100)).status).toBe(200);
    expect(await (await put(200)).json()).toMatchObject({ target: 200 });
    expect((await call('teacher', 'DELETE', '/challenge')).status).toBe(204);
    const feed = (await (await call('teacher', 'GET', '/feed')).json()) as {
      challenge: unknown;
    };
    expect(feed.challenge).toBeNull();
    expect(
      (
        await call('teacher', 'PUT', '/challenge', {
          template: 'xp',
          target: 0,
          timeZone: 'UTC',
        })
      ).status
    ).toBe(400);
    expect(
      (
        await call('teacher', 'PUT', '/challenge', {
          template: 'xp',
          target: 5,
          timeZone: 'Mars/Base',
        })
      ).status
    ).toBe(400);
  });

  it('ranks only learners who opted in, by share of their own weekly goal', async () => {
    const quests = (user: string, days: string[]) =>
      Promise.all(
        days.map((day) =>
          pool.query(
            `insert into quest_progress (user_id, day, quest_id, progress, target, completed_at)
             values ($1, $2, 'review', 1, 1, $3)`,
            [users[user]!.id, day, `${day}T10:00:00Z`]
          )
        )
      );
    // Amina: 2 of 3 days this week (goal 3); Bilal: 3 of 5 (default goal) plus last week.
    await pool.query(
      `insert into settings (user_id, id, key, "weeklyGoal", updated_at)
       values ($1, 'user-settings', 'user-settings', 3, now())`,
      [users.amina!.id]
    );
    await quests('amina', ['2026-09-21', '2026-09-22']);
    await quests('bilal', ['2026-09-18', '2026-09-21', '2026-09-22', '2026-09-23']);

    // Off by default: nobody is ranked, learners see their own switch only.
    expect(await (await call('amina', 'GET', '/league')).json()).toMatchObject({
      enabled: false,
      optedIn: false,
      podium: [],
    });
    expect(
      (await call('amina', 'PUT', '/league/settings', { enabled: true, minors: false }))
        .status
    ).toBe(403);
    expect(
      (await call('teacher', 'PUT', '/league/settings', { enabled: true, minors: false }))
        .status
    ).toBe(204);

    // Enabled, but only who opted in takes part.
    expect((await call('amina', 'PUT', '/league/opt-in', { optIn: true })).status).toBe(
      204
    );
    type View = {
      participants: number;
      podium: { place: number; name: string; percent: number; you: boolean }[];
      you: { percent: number; onPodium: boolean } | null;
    };
    const league = async (who: string) =>
      (await (await call(who, 'GET', '/league')).json()) as View;
    let view = await league('amina');
    expect(view.participants).toBe(1);
    expect(view.podium).toEqual([
      { place: 1, title: 'Wochen-Stern', name: 'Amina', percent: 66, you: true },
    ]);

    await call('bilal', 'PUT', '/league/opt-in', { optIn: true });
    view = await league('bilal');
    expect(view.podium.map((p) => [p.place, p.percent, p.you])).toEqual([
      [1, 66, false],
      [2, 60, true],
    ]);
    expect(view.you).toMatchObject({ percent: 60, onPodium: true });

    // Teachers are not ranked and cannot opt in.
    expect((await call('teacher', 'PUT', '/league/opt-in', { optIn: true })).status).toBe(
      409
    );
    expect(await (await call('teacher', 'GET', '/league')).json()).toMatchObject({
      optedIn: null,
      you: null,
    });
    expect((await call('other', 'GET', '/league')).status).toBe(403);

    // A class of minors shows first names only; the change is audit-logged.
    await pool.query("update users set name = 'Bilal Yilmaz' where id = $1", [
      users.bilal!.id,
    ]);
    await call('teacher', 'PUT', '/league/settings', { enabled: true, minors: true });
    view = await league('bilal');
    expect(view.podium.map((p) => p.name)).toContain('Bilal');
    const audit = await pool.query(
      "select count(*)::int as n from audit_log where action = 'class.league.settings'"
    );
    expect(audit.rows[0].n).toBe(2);
  });
});
