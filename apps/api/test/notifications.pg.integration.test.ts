/**
 * Reminders, preferences and weekly recaps against a real Postgres (stories 6.3, 6.4).
 * Run with SUFFA_TEST_DATABASE_URL; the database is wiped.
 */
import { join } from 'node:path';
import pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { AuthResolver } from '../src/auth/resolver.js';
import { loadMigrations, migrate } from '../src/migrate.js';
import type { Notifier, PushMessage, SendResult } from '../src/notifications/notifier.js';
import { PgRecapRepository, runWeeklyRecaps } from '../src/notifications/recap.js';
import { runReminders } from '../src/notifications/reminders.js';
import { PgNotificationRepository } from '../src/notifications/repository.js';

const url = process.env.SUFFA_TEST_DATABASE_URL;
const quiet = { info: () => undefined, warn: () => undefined, error: () => undefined };
const AMINA = '00000000-0000-4000-8000-00000000000a';
const ENDPOINT = 'https://push.example.org/device-1';

class FakeNotifier implements Notifier {
  readonly enabled = true;
  sent: PushMessage[] = [];
  next: SendResult = 'sent';
  async send(_target: unknown, message: PushMessage) {
    if (this.next === 'sent') this.sent.push(message);
    return this.next;
  }
}

describe.skipIf(!url)('Notifications (Postgres)', () => {
  let pool: pg.Pool;
  let repo: PgNotificationRepository;
  let app: ReturnType<typeof createApp>;
  let notifier: FakeNotifier;

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: url, max: 4 });
    await pool.query('drop schema public cascade; create schema public');
    await migrate(
      pool,
      await loadMigrations(join(import.meta.dirname, '..', 'migrations')),
      quiet
    );
    repo = new PgNotificationRepository(pool);
  });

  beforeEach(async () => {
    await pool.query('truncate users cascade');
    await pool.query(
      "insert into users (id, email, time_zone) values ($1, 'amina@example.org', 'Europe/Zurich')",
      [AMINA]
    );
    notifier = new FakeNotifier();
    const auth: AuthResolver = {
      actor: async (h) => (h.get('x-test-user') ? { id: AMINA, role: 'student' } : null),
    };
    app = createApp({
      version: 'test',
      expectedRevision: null,
      health: {
        schemaRevision: async () => null,
        queueDepth: async () => ({ waiting: 0, active: 0, failed: 0, deadLetter: 0 }),
      },
      notifications: {
        repo,
        recaps: new PgRecapRepository(pool),
        publicKey: 'BPublicKey',
        auth,
        log: quiet,
      },
    });
  });

  afterAll(async () => {
    await pool?.end();
  });

  const call = (method: string, path: string, body?: unknown) =>
    app.request(`/api/v1${path}`, {
      method,
      headers: { 'x-test-user': 'amina', 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

  const enable = async (reminderTime = '18:00') => {
    expect(
      (
        await call('POST', '/notifications/subscriptions', {
          endpoint: ENDPOINT,
          keys: { p256dh: 'BKey-1', auth: 'auth_1' },
        })
      ).status
    ).toBe(204);
    expect(
      (
        await call('PUT', '/notifications/preferences', {
          reminderEnabled: true,
          reminderTime,
          quietStart: '22:00',
          quietEnd: '07:00',
          weeklyRecap: true,
        })
      ).status
    ).toBe(204);
  };

  it('stores preferences and devices for the signed-in user', async () => {
    const before = await (await call('GET', '/notifications')).json();
    expect(before).toMatchObject({
      publicKey: 'BPublicKey',
      devices: 0,
      appPush: false,
      prefs: { reminderEnabled: false, reminderTime: '18:00' },
    });
    await enable('19:30');
    expect(await (await call('GET', '/notifications')).json()).toMatchObject({
      devices: 1,
      prefs: { reminderEnabled: true, reminderTime: '19:30' },
    });
    expect(
      (
        await call('PUT', '/notifications/preferences', {
          reminderEnabled: true,
          reminderTime: '25:00',
          quietStart: '22:00',
          quietEnd: '07:00',
          weeklyRecap: true,
        })
      ).status
    ).toBe(400);
    expect(
      (
        await call('POST', '/notifications/subscriptions', {
          endpoint: 'http://insecure.example/1',
          keys: { p256dh: 'k', auth: 'a' },
        })
      ).status
    ).toBe(400);
    expect(
      (await call('DELETE', '/notifications/subscriptions', { endpoint: ENDPOINT }))
        .status
    ).toBe(204);
    expect(await (await call('GET', '/notifications')).json()).toMatchObject({
      devices: 0,
    });
  });

  it('sends one reminder a day at the chosen time, not when today is done', async () => {
    await enable('18:00');
    const at1800 = new Date('2026-09-24T16:00:00Z'); // 18:00 in Zurich
    expect(
      await runReminders(repo, notifier, quiet, new Date('2026-09-24T15:00:00Z'))
    ).toEqual({
      sent: 0,
      skippedDone: 0,
    });
    expect((await runReminders(repo, notifier, quiet, at1800)).sent).toBe(1);
    expect(notifier.sent[0]).toMatchObject({ tag: 'daily-reminder', url: '/' });
    // A second run in the same window (retry, second worker) sends nothing.
    expect((await runReminders(repo, notifier, quiet, at1800)).sent).toBe(0);

    // Next day, a quest is already done: no reminder.
    await pool.query(
      `insert into quest_progress (user_id, day, quest_id, progress, target, completed_at)
       values ($1, '2026-09-25', 'review-10', 10, 10, '2026-09-25T07:00:00Z')`,
      [AMINA]
    );
    expect(
      await runReminders(repo, notifier, quiet, new Date('2026-09-25T16:00:00Z'))
    ).toEqual({ sent: 0, skippedDone: 1 });
  });

  it('drops devices that are gone', async () => {
    await enable('18:00');
    notifier.next = 'gone';
    await runReminders(repo, notifier, quiet, new Date('2026-09-24T16:00:00Z'));
    const { rows } = await pool.query(
      'select count(*)::int as n from push_subscriptions'
    );
    expect(rows[0].n).toBe(0);
  });

  it('generates the weekly recap on Sunday evening and announces it once', async () => {
    await enable('18:00');
    await pool.query(
      `insert into xp_ledger (user_id, event_key, kind, points, earned_at, rules_version)
       values ($1, 'quest:a', 'quest', 30, '2026-09-22T08:00:00Z', 1),
              ($1, 'quest:b', 'quest', 25, '2026-09-24T08:00:00Z', 1),
              ($1, 'quest:c', 'quest', 20, '2026-09-24T09:00:00Z', 1),
              ($1, 'quest:old', 'quest', 99, '2026-09-14T09:00:00Z', 1)`,
      [AMINA]
    );
    await pool.query(
      `insert into quest_progress (user_id, day, quest_id, progress, target, completed_at)
       values ($1, '2026-09-22', 'review-10', 10, 10, '2026-09-22T08:00:00Z'),
              ($1, '2026-09-24', 'new-3', 3, 3, '2026-09-24T08:00:00Z')`,
      [AMINA]
    );
    const recaps = new PgRecapRepository(pool);
    const saturday = new Date('2026-09-26T17:00:00Z');
    expect(await runWeeklyRecaps(recaps, repo, notifier, quiet, saturday)).toBe(0);
    const sunday = new Date('2026-09-27T16:10:00Z'); // 18:10 in Zurich
    expect(await runWeeklyRecaps(recaps, repo, notifier, quiet, sunday)).toBe(1);
    expect(await runWeeklyRecaps(recaps, repo, notifier, quiet, sunday)).toBe(0);
    expect(notifier.sent.map((m) => m.tag)).toEqual(['weekly-recap']);

    const { recap } = (await (await call('GET', '/recaps/latest')).json()) as {
      recap: Record<string, unknown>;
    };
    expect(recap).toMatchObject({
      weekStart: '2026-09-21',
      xp: 75,
      quests: 2,
      activeDays: 2,
      bestDay: { day: '2026-09-24', xp: 45 },
      badges: [],
      classChallenges: 0,
    });
  });
});
