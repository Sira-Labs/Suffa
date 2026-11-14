/**
 * Push reminders before a live lesson against a real Postgres (ADR-0026, stage 3): who is
 * told, that a session is announced once, and the preference that switches it off.
 * Run with SUFFA_TEST_DATABASE_URL; the database is wiped.
 */
import { join } from 'node:path';
import pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { AuthResolver } from '../src/auth/resolver.js';
import { PgLiveReminderRepository, runLiveReminders } from '../src/live/reminders.js';
import { loadMigrations, migrate } from '../src/migrate.js';
import type { Notifier, PushMessage, PushTarget } from '../src/notifications/notifier.js';
import { PgRecapRepository } from '../src/notifications/recap.js';
import { PgNotificationRepository } from '../src/notifications/repository.js';

const url = process.env.SUFFA_TEST_DATABASE_URL;
const quiet = { info: () => undefined, warn: () => undefined, error: () => undefined };
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const TEACHER = id(1);
const SISTER = id(2);
const BROTHER = id(3);
const UNASSIGNED = id(4);
const PENDING = id(5);
const OUTSIDER = id(6);
const CLASS = id(100);
const SESSION = id(200);
const endpointOf = (userId: string) => `https://push.example.org/${userId}`;

class FakeNotifier implements Notifier {
  readonly enabled = true;
  sent: { endpoint: string; message: PushMessage }[] = [];
  async send(target: PushTarget, message: PushMessage) {
    this.sent.push({ endpoint: target.endpoint, message });
    return 'sent' as const;
  }
  /** The users reached, in a stable order. */
  users() {
    return this.sent.map((s) => s.endpoint.split('/').pop()).sort();
  }
}

describe.skipIf(!url)('Live lesson reminders (Postgres)', () => {
  let pool: pg.Pool;
  let repo: PgLiveReminderRepository;
  let notifications: PgNotificationRepository;
  let notifier: FakeNotifier;
  // Monday 16 Nov 2026, 17:50 in Zurich; lessons below start at 18:00.
  const now = new Date('2026-11-16T16:50:00Z');
  const run = (at: Date = now) =>
    runLiveReminders(repo, notifications, notifier, quiet, at);

  const plan = (
    over: { id?: string; startsAt?: string; audience?: string; status?: string } = {}
  ) =>
    pool.query(
      `insert into live_sessions (id, class_id, title, starts_at, duration_minutes, audience, status)
       values ($1, $2, 'Lektion 4', $3, 60, $4, $5)`,
      [
        over.id ?? SESSION,
        CLASS,
        over.startsAt ?? '2026-11-16T17:00:00Z',
        over.audience ?? 'all',
        over.status ?? 'scheduled',
      ]
    );

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: url, max: 4 });
    await pool.query('drop schema public cascade; create schema public');
    await migrate(
      pool,
      await loadMigrations(join(import.meta.dirname, '..', 'migrations')),
      quiet
    );
    repo = new PgLiveReminderRepository(pool);
    notifications = new PgNotificationRepository(pool);
  });

  beforeEach(async () => {
    await pool.query('truncate users, classes cascade');
    notifier = new FakeNotifier();
    const people: [string, string][] = [
      [TEACHER, 'teacher'],
      [SISTER, 'sister'],
      [BROTHER, 'brother'],
      [UNASSIGNED, 'unassigned'],
      [PENDING, 'pending'],
      [OUTSIDER, 'outsider'],
    ];
    for (const [userId, name] of people) {
      await pool.query(
        "insert into users (id, email, time_zone) values ($1, $2, 'Europe/Zurich')",
        [userId, `${name}@example.org`]
      );
      await notifications.subscribe(
        userId,
        { endpoint: endpointOf(userId), p256dh: 'k', auth: 'a' },
        null
      );
    }
    await pool.query("insert into classes (id, name) values ($1, 'Bayna Yadayk 1')", [
      CLASS,
    ]);
    await pool.query(
      `insert into class_members (class_id, user_id, class_role, status, section) values
         ($1, $2, 'teacher', 'active', null),
         ($1, $3, 'student', 'active', 'sisters'),
         ($1, $4, 'student', 'active', 'brothers'),
         ($1, $5, 'student', 'active', null),
         ($1, $6, 'student', 'pending', null)`,
      [CLASS, TEACHER, SISTER, BROTHER, UNASSIGNED, PENDING]
    );
  });

  afterAll(async () => {
    await pool?.end();
  });

  it('announces a lesson for everyone once, to the active members only', async () => {
    await plan();
    expect(await run()).toEqual({ sessions: 1, sent: 4, quiet: 0 });
    expect(notifier.users()).toEqual([TEACHER, SISTER, BROTHER, UNASSIGNED].sort());
    expect(notifier.sent[0]!.message).toEqual({
      title: 'Gleich live: Lektion 4',
      body: 'Bayna Yadayk 1 · Beginn um 18:00 Uhr',
      url: `/classes/${CLASS}`,
      tag: `live-${SESSION}`,
    });
    // The next check, a retried job or a second worker sends nothing more.
    expect(await run(new Date('2026-11-16T16:55:00Z'))).toEqual({
      sessions: 0,
      sent: 0,
      quiet: 0,
    });
    expect(notifier.sent).toHaveLength(4);
  });

  it("tells only the sisters and the teacher about a sisters' lesson", async () => {
    await plan({ audience: 'sisters' });
    expect((await run()).sent).toBe(2);
    expect(notifier.users()).toEqual([TEACHER, SISTER].sort());
  });

  it('waits until a quarter of an hour before the start', async () => {
    await plan();
    expect((await run(new Date('2026-11-16T16:40:00Z'))).sessions).toBe(0);
    expect((await run(new Date('2026-11-16T16:45:00Z'))).sessions).toBe(1);
  });

  it('skips lessons that started, were missed, or belong to an archived class', async () => {
    await plan({ status: 'live' });
    await plan({ id: id(201), startsAt: '2026-11-16T16:30:00Z' });
    expect((await run()).sessions).toBe(0);
    await plan({ id: id(202) });
    await pool.query('update classes set archived_at = now() where id = $1', [CLASS]);
    expect((await run()).sessions).toBe(0);
    expect(notifier.sent).toHaveLength(0);
  });

  it('leaves out members who are disabled, have no device, or are in quiet hours', async () => {
    await plan();
    await pool.query('update users set disabled_at = now() where id = $1', [SISTER]);
    await pool.query('delete from push_subscriptions where user_id = $1', [BROTHER]);
    await notifications.savePrefs(UNASSIGNED, {
      reminderEnabled: false,
      reminderTime: '18:00',
      quietStart: '17:00',
      quietEnd: '19:00',
      weeklyRecap: true,
    });
    expect(await run()).toEqual({ sessions: 1, sent: 1, quiet: 1 });
    expect(notifier.users()).toEqual([TEACHER]);
  });

  it('lets a learner switch live reminders off; older apps keep that choice', async () => {
    const auth: AuthResolver = {
      actor: async (h) => (h.get('x-test-user') ? { id: SISTER, role: 'student' } : null),
    };
    const app = createApp({
      version: 'test',
      expectedRevision: null,
      health: {
        schemaRevision: async () => null,
        queueDepth: async () => ({ waiting: 0, active: 0, failed: 0, deadLetter: 0 }),
      },
      notifications: {
        repo: notifications,
        recaps: new PgRecapRepository(pool),
        publicKey: 'BPublicKey',
        auth,
        log: quiet,
      },
    });
    const call = (method: string, body?: unknown) =>
      app.request(`/api/v1/notifications${method === 'PUT' ? '/preferences' : ''}`, {
        method,
        headers: { 'x-test-user': 'sister', 'content-type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    const base = {
      reminderEnabled: false,
      reminderTime: '18:00',
      quietStart: '22:00',
      quietEnd: '07:00',
      weeklyRecap: true,
    };
    const liveReminder = async () =>
      ((await (await call('GET')).json()) as { prefs: { liveReminder: boolean } }).prefs
        .liveReminder;

    expect(await liveReminder()).toBe(true);
    expect((await call('PUT', { ...base, liveReminder: false })).status).toBe(204);
    expect(await liveReminder()).toBe(false);
    // An app from before this setting saves without it and does not switch it back on.
    expect((await call('PUT', base)).status).toBe(204);
    expect(await liveReminder()).toBe(false);
    expect((await call('PUT', { ...base, liveReminder: 'yes' })).status).toBe(400);

    await plan();
    await run();
    expect(notifier.users()).not.toContain(SISTER);
    expect(notifier.users()).toContain(BROTHER);
  });
});
