/** Push subscriptions, reminder preferences and the daily notification log (story 6.3). */
import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import type { PushTarget } from './notifier.js';

export interface NotificationPrefs {
  reminderEnabled: boolean;
  reminderTime: string;
  quietStart: string;
  quietEnd: string;
  weeklyRecap: boolean;
}

export const DEFAULT_PREFS: NotificationPrefs = {
  reminderEnabled: false,
  reminderTime: '18:00',
  quietStart: '22:00',
  quietEnd: '07:00',
  weeklyRecap: true,
};

export interface Recipient {
  userId: string;
  timeZone: string;
  prefs: NotificationPrefs;
  streak: number;
}

export interface NotificationRepository {
  subscribe(userId: string, target: PushTarget, userAgent: string | null): Promise<void>;
  unsubscribe(userId: string, endpoint: string): Promise<boolean>;
  prefs(userId: string): Promise<NotificationPrefs & { devices: number }>;
  savePrefs(userId: string, prefs: NotificationPrefs): Promise<void>;
  /** Learners with at least one device; `reminders` = only those with reminders on. */
  recipients(filter: 'reminders' | 'recaps'): Promise<Recipient[]>;
  targets(userId: string): Promise<PushTarget[]>;
  /** Was a daily quest done on this local day? */
  doneOn(userId: string, day: string): Promise<boolean>;
  /** Claims today's slot for a kind; false when something was sent already. */
  claim(userId: string, kind: string, day: string): Promise<boolean>;
  delivered(endpoint: string, result: 'sent' | 'gone' | 'failed'): Promise<void>;
}

/** A device that failed this often in a row is dropped. */
export const MAX_FAILURES = 5;

const prefsOf = (r: Record<string, unknown> | undefined): NotificationPrefs =>
  r
    ? {
        reminderEnabled: r.reminder_enabled as boolean,
        reminderTime: r.reminder_time as string,
        quietStart: r.quiet_start as string,
        quietEnd: r.quiet_end as string,
        weeklyRecap: r.weekly_recap as boolean,
      }
    : DEFAULT_PREFS;

export class PgNotificationRepository implements NotificationRepository {
  constructor(private readonly pool: pg.Pool) {}

  async subscribe(userId: string, target: PushTarget, userAgent: string | null) {
    // An endpoint belongs to one browser; a new sign-in on it takes it over.
    await this.pool.query(
      `insert into push_subscriptions (id, user_id, endpoint, p256dh, auth, user_agent)
       values ($1, $2, $3, $4, $5, $6)
       on conflict (endpoint) do update set user_id = excluded.user_id,
         p256dh = excluded.p256dh, auth = excluded.auth,
         user_agent = excluded.user_agent, failures = 0`,
      [randomUUID(), userId, target.endpoint, target.p256dh, target.auth, userAgent]
    );
  }

  async unsubscribe(userId: string, endpoint: string) {
    const { rowCount } = await this.pool.query(
      'delete from push_subscriptions where user_id = $1 and endpoint = $2',
      [userId, endpoint]
    );
    return (rowCount ?? 0) > 0;
  }

  async prefs(userId: string) {
    const [prefs, devices] = await Promise.all([
      this.pool.query('select * from notification_prefs where user_id = $1', [userId]),
      this.pool.query(
        'select count(*)::int as n from push_subscriptions where user_id = $1',
        [userId]
      ),
    ]);
    return { ...prefsOf(prefs.rows[0]), devices: devices.rows[0].n as number };
  }

  async savePrefs(userId: string, prefs: NotificationPrefs) {
    await this.pool.query(
      `insert into notification_prefs
         (user_id, reminder_enabled, reminder_time, quiet_start, quiet_end, weekly_recap, updated_at)
       values ($1, $2, $3, $4, $5, $6, now())
       on conflict (user_id) do update set reminder_enabled = excluded.reminder_enabled,
         reminder_time = excluded.reminder_time, quiet_start = excluded.quiet_start,
         quiet_end = excluded.quiet_end, weekly_recap = excluded.weekly_recap,
         updated_at = now()`,
      [
        userId,
        prefs.reminderEnabled,
        prefs.reminderTime,
        prefs.quietStart,
        prefs.quietEnd,
        prefs.weeklyRecap,
      ]
    );
  }

  async recipients(filter: 'reminders' | 'recaps') {
    const { rows } = await this.pool.query(
      `select u.id, u.time_zone, coalesce(es.streak_current, 0) as streak, p.*
         from users u
         left join notification_prefs p on p.user_id = u.id
         left join engagement_state es on es.user_id = u.id
        where u.disabled_at is null
          and exists (select 1 from push_subscriptions s where s.user_id = u.id)
          and ${filter === 'reminders' ? 'p.reminder_enabled' : 'coalesce(p.weekly_recap, true)'}`
    );
    return rows.map((r) => ({
      userId: r.id as string,
      timeZone: (r.time_zone as string | null) ?? 'UTC',
      prefs: prefsOf(r.user_id ? r : undefined),
      streak: r.streak as number,
    }));
  }

  async targets(userId: string) {
    const { rows } = await this.pool.query(
      'select endpoint, p256dh, auth from push_subscriptions where user_id = $1',
      [userId]
    );
    return rows as PushTarget[];
  }

  async doneOn(userId: string, day: string) {
    const { rows } = await this.pool.query(
      `select 1 from quest_progress
        where user_id = $1 and day = $2 and completed_at is not null limit 1`,
      [userId, day]
    );
    return rows.length > 0;
  }

  async claim(userId: string, kind: string, day: string) {
    const { rowCount } = await this.pool.query(
      `insert into notification_log (user_id, kind, day) values ($1, $2, $3)
       on conflict do nothing`,
      [userId, kind, day]
    );
    return (rowCount ?? 0) > 0;
  }

  async delivered(endpoint: string, result: 'sent' | 'gone' | 'failed') {
    if (result === 'sent') {
      await this.pool.query(
        'update push_subscriptions set last_success_at = now(), failures = 0 where endpoint = $1',
        [endpoint]
      );
    } else if (result === 'gone') {
      await this.pool.query('delete from push_subscriptions where endpoint = $1', [
        endpoint,
      ]);
    } else {
      await this.pool.query(
        `update push_subscriptions set failures = failures + 1 where endpoint = $1;`,
        [endpoint]
      );
      await this.pool.query(
        'delete from push_subscriptions where endpoint = $1 and failures >= $2',
        [endpoint, MAX_FAILURES]
      );
    }
  }
}
