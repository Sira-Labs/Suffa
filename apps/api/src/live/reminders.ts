/**
 * Push reminder before a live lesson (ADR-0026, stage 3). The worker looks every five minutes
 * for planned sessions that start within the next quarter of an hour and announces each one
 * once: to the class's teachers and to the learners the session is for (everyone, the sisters
 * or the brothers), on the devices they registered for push.
 *
 * Not sent to a learner who switched live reminders off, nor while it is their quiet hours
 * when the reminder would arrive. A session is claimed before anything is sent: a crash may
 * lose a reminder but never sends two. One member's failed delivery does not cost the others
 * theirs: the run goes on and reports the failures at its end.
 */
import type pg from 'pg';
import type { Logger } from 'pino';
import type { Notifier, PushMessage } from '../notifications/notifier.js';
import { deliver } from '../notifications/reminders.js';
import {
  DEFAULT_PREFS,
  type NotificationRepository,
} from '../notifications/repository.js';
import { inQuietHours, localClock } from '../notifications/schedule.js';

/** A session is announced in the first check within this many minutes before its start. */
export const LIVE_REMINDER_LEAD_MINUTES = 15;

export interface DueLiveSession {
  id: string;
  classId: string;
  className: string;
  title: string;
  startsAt: Date;
}

export interface LiveReminderRecipient {
  userId: string;
  timeZone: string;
  quietStart: string;
  quietEnd: string;
}

export interface LiveReminderRepository {
  /**
   * Claims the planned sessions of active classes that start after `now` and within
   * `leadMinutes`, and returns them; a claimed session is never returned again.
   */
  claimDue(now: Date, leadMinutes: number): Promise<DueLiveSession[]>;
  /**
   * Who hears about a session: active members it is for (teachers always) who have a device
   * and did not switch live reminders off.
   */
  recipients(sessionId: string): Promise<LiveReminderRecipient[]>;
}

export class PgLiveReminderRepository implements LiveReminderRepository {
  constructor(private readonly pool: pg.Pool) {}

  async claimDue(now: Date, leadMinutes: number): Promise<DueLiveSession[]> {
    const { rows } = await this.pool.query<{
      id: string;
      class_id: string;
      class_name: string;
      title: string;
      starts_at: Date;
    }>(
      `update live_sessions s
          set reminded_at = $1
         from classes c
        where c.id = s.class_id and c.archived_at is null
          and s.status = 'scheduled' and s.reminded_at is null
          and s.starts_at > $1 and s.starts_at <= $1::timestamptz + make_interval(mins => $2)
        returning s.id, s.class_id, c.name as class_name, s.title, s.starts_at`,
      [now, leadMinutes]
    );
    return rows.map((r) => ({
      id: r.id,
      classId: r.class_id,
      className: r.class_name,
      title: r.title,
      startsAt: r.starts_at,
    }));
  }

  async recipients(sessionId: string): Promise<LiveReminderRecipient[]> {
    const { rows } = await this.pool.query<{
      id: string;
      time_zone: string | null;
      quiet_start: string | null;
      quiet_end: string | null;
    }>(
      `select u.id, u.time_zone, p.quiet_start, p.quiet_end
         from live_sessions s
         join class_members m on m.class_id = s.class_id and m.status = 'active'
         join users u on u.id = m.user_id and u.disabled_at is null
         left join notification_prefs p on p.user_id = u.id
        where s.id = $1
          and (m.class_role = 'teacher' or s.audience = 'all' or m.section = s.audience)
          and coalesce(p.live_reminder, true)
          and exists (select 1 from push_subscriptions d where d.user_id = u.id)
        order by u.id`,
      [sessionId]
    );
    return rows.map((r) => ({
      userId: r.id,
      timeZone: r.time_zone ?? 'UTC',
      quietStart: r.quiet_start ?? DEFAULT_PREFS.quietStart,
      quietEnd: r.quiet_end ?? DEFAULT_PREFS.quietEnd,
    }));
  }
}

/** "18:30" in the recipient's time zone. */
function localTime(at: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('de-DE', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(at);
}

/** German like the other server-sent notifications; opens the class, where the lesson is. */
export function liveReminderMessage(
  session: DueLiveSession,
  timeZone: string
): PushMessage {
  return {
    title: `Gleich live: ${session.title}`,
    body: `${session.className} · Beginn um ${localTime(session.startsAt, timeZone)} Uhr`,
    url: `/classes/${session.classId}`,
    tag: `live-${session.id}`,
  };
}

export interface LiveReminderResult {
  /** Sessions announced in this run. */
  sessions: number;
  /** Members reached on at least one device. */
  sent: number;
  /** Members left alone because of their quiet hours. */
  quiet: number;
  /** Members whose delivery threw (push service or database unreachable). */
  failed: number;
  /** Sessions whose members could not be read, so nobody was told. */
  sessionsFailed: number;
}

/** Deliveries and member look-ups that threw in a run; thrown once every claimed session was worked through. */
export class LiveReminderDeliveryError extends AggregateError {
  constructor(
    errors: unknown[],
    readonly result: LiveReminderResult
  ) {
    super(
      errors,
      `live reminders: ${errors.length} failures (deliveries or member look-ups)`
    );
    this.name = 'LiveReminderDeliveryError';
  }
}

export async function runLiveReminders(
  repo: LiveReminderRepository,
  notifications: Pick<NotificationRepository, 'targets' | 'delivered'>,
  notifier: Notifier,
  log: Pick<Logger, 'info'>,
  now: Date = new Date()
): Promise<LiveReminderResult> {
  const result: LiveReminderResult = {
    sessions: 0,
    sent: 0,
    quiet: 0,
    failed: 0,
    sessionsFailed: 0,
  };
  const failures: unknown[] = [];
  // Without push nothing is claimed, so reminders start with the first session after set-up.
  if (!notifier.enabled) return result;
  for (const session of await repo.claimDue(now, LIVE_REMINDER_LEAD_MINUTES)) {
    result.sessions++;
    let recipients: LiveReminderRecipient[];
    try {
      recipients = await repo.recipients(session.id);
    } catch (error) {
      // As below: this session is lost, the ones after it are not.
      result.sessionsFailed++;
      failures.push(error);
      continue;
    }
    for (const r of recipients) {
      const { minutes } = localClock(now, r.timeZone);
      if (inQuietHours(minutes, r.quietStart, r.quietEnd)) {
        result.quiet++;
        continue;
      }
      const message = liveReminderMessage(session, r.timeZone);
      try {
        if ((await deliver(notifications, notifier, r.userId, message)) > 0)
          result.sent++;
      } catch (error) {
        // The sessions are claimed already, so a retry would send nothing: carry on with the
        // other members and sessions, and fail the job afterwards so the error is reported.
        result.failed++;
        failures.push(error);
      }
    }
  }
  log.info({ ...result }, 'notifications.live_reminders');
  if (failures.length > 0) throw new LiveReminderDeliveryError(failures, result);
  return result;
}
