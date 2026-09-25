/**
 * Weekly recap (story 6.4): the learner's week in a few numbers, generated on Sunday evening
 * in their time zone from the server's copy of their data, shown in the app and announced
 * by push when they opted in.
 */
import type pg from 'pg';
import type { Logger } from 'pino';
import { addDays, weekStart } from '@suffa/engagement';
import { deliver } from './reminders.js';
import type { Notifier } from './notifier.js';
import type { NotificationRepository } from './repository.js';
import { inQuietHours, localClock } from './schedule.js';

/** Recaps are generated from this local hour on Sunday. */
export const RECAP_HOUR = 18;

export interface WeeklyRecap {
  weekStart: string;
  xp: number;
  quests: number;
  activeDays: number;
  /** Cards that became mature (≥ 21 days) for the first time this week. */
  wordsMatured: number;
  /** Time spent answering cards, rounded. */
  reviewMinutes: number;
  bestDay: { day: string; xp: number } | null;
  badges: { badgeId: string; tier: string }[];
  classChallenges: number;
}

export interface RecapRepository {
  /** Learners active in the week (anything in the ledger), with their time zone. */
  learners(): Promise<{ userId: string; timeZone: string }[]>;
  exists(userId: string, weekStart: string): Promise<boolean>;
  compute(userId: string, weekStart: string, timeZone: string): Promise<WeeklyRecap>;
  save(userId: string, recap: WeeklyRecap): Promise<void>;
  latest(userId: string): Promise<WeeklyRecap | null>;
}

export class PgRecapRepository implements RecapRepository {
  constructor(private readonly pool: pg.Pool) {}

  async learners() {
    const { rows } = await this.pool.query(
      `select u.id, coalesce(u.time_zone, 'UTC') as tz from users u
        where u.disabled_at is null
          and exists (select 1 from xp_ledger x where x.user_id = u.id
                       and x.earned_at > now() - interval '8 days')`
    );
    return rows.map((r) => ({ userId: r.id as string, timeZone: r.tz as string }));
  }

  async exists(userId: string, week: string) {
    const { rows } = await this.pool.query(
      'select 1 from weekly_recaps where user_id = $1 and week_start = $2',
      [userId, week]
    );
    return rows.length > 0;
  }

  async compute(userId: string, week: string, timeZone: string): Promise<WeeklyRecap> {
    // [start, end) of the local week as instants.
    const window = `($2::date::timestamp at time zone $3)`;
    const end = `($2::date::timestamp at time zone $3) + interval '7 days'`;
    const one = async <T>(sql: string) =>
      (await this.pool.query(sql, [userId, week, timeZone])).rows[0] as T;
    const [xp, quests, matured, minutes, best, badges, challenges] = await Promise.all([
      one<{ n: number }>(
        `select coalesce(sum(points), 0)::int as n from xp_ledger
          where user_id = $1 and earned_at >= ${window} and earned_at < ${end}`
      ),
      one<{ n: number; days: number }>(
        `select count(*)::int as n, count(distinct day)::int as days from quest_progress
          where user_id = $1 and completed_at >= ${window} and completed_at < ${end}`
      ),
      one<{ n: number }>(
        `select count(distinct r."cardId")::int as n from review_logs r
          where r.user_id = $1 and not r.deleted and r."scheduledInterval" >= 21
            and r."reviewedAt" >= ${window} and r."reviewedAt" < ${end}
            and not exists (select 1 from review_logs e
                             where e.user_id = r.user_id and e."cardId" = r."cardId"
                               and not e.deleted and e."scheduledInterval" >= 21
                               and e."reviewedAt" < ${window})`
      ),
      one<{ n: number }>(
        `select round(coalesce(sum(least("durationMs", 120000)), 0) / 60000.0)::int as n
           from review_logs
          where user_id = $1 and not deleted
            and "reviewedAt" >= ${window} and "reviewedAt" < ${end}`
      ),
      one<{ day: string; xp: number } | undefined>(
        `select (earned_at at time zone $3)::date::text as day, sum(points)::int as xp
           from xp_ledger
          where user_id = $1 and earned_at >= ${window} and earned_at < ${end}
          group by 1 order by 2 desc, 1 limit 1`
      ),
      this.pool.query(
        `select badge_id, tier from achievement_unlocks
          where user_id = $1 and unlocked_at >= ${window} and unlocked_at < ${end}
          order by unlocked_at`,
        [userId, week, timeZone]
      ),
      one<{ n: number }>(
        `select count(*)::int as n from class_challenge_contributors c
           join class_challenges ch on ch.id = c.challenge_id
          where c.user_id = $1 and ch.reached_at is not null and ch.week_start = $2
            and $3::text is not null`
      ),
    ]);
    return {
      weekStart: week,
      xp: xp.n,
      quests: quests.n,
      activeDays: quests.days,
      wordsMatured: matured.n,
      reviewMinutes: minutes.n,
      bestDay: best && best.xp > 0 ? best : null,
      badges: badges.rows.map((b) => ({ badgeId: b.badge_id, tier: b.tier })),
      classChallenges: challenges.n,
    };
  }

  async save(userId: string, recap: WeeklyRecap) {
    await this.pool.query(
      `insert into weekly_recaps (user_id, week_start, data) values ($1, $2, $3)
       on conflict do nothing`,
      [userId, recap.weekStart, JSON.stringify(recap)]
    );
  }

  async latest(userId: string) {
    const { rows } = await this.pool.query(
      `select data from weekly_recaps where user_id = $1 order by week_start desc limit 1`,
      [userId]
    );
    return (rows[0]?.data as WeeklyRecap | undefined) ?? null;
  }
}

/** Is it Sunday evening (or later that night) in this time zone? Returns the week then. */
export function recapWeekDue(now: Date, timeZone: string): string | null {
  const { day, minutes } = localClock(now, timeZone);
  const sunday = addDays(weekStart(day), 6);
  return day === sunday && minutes >= RECAP_HOUR * 60 ? weekStart(day) : null;
}

/** Hourly: generates due recaps and announces them (at most one push per week). */
export async function runWeeklyRecaps(
  recaps: RecapRepository,
  notifications: NotificationRepository,
  notifier: Notifier,
  log: Pick<Logger, 'info'>,
  now: Date = new Date()
): Promise<number> {
  let generated = 0;
  for (const { userId, timeZone } of await recaps.learners()) {
    const week = recapWeekDue(now, timeZone);
    if (!week || (await recaps.exists(userId, week))) continue;
    const recap = await recaps.compute(userId, week, timeZone);
    await recaps.save(userId, recap);
    generated++;
    if (!notifier.enabled) continue;
    const prefs = await notifications.prefs(userId);
    const { day, minutes } = localClock(now, timeZone);
    if (!prefs.weeklyRecap || prefs.devices === 0) continue;
    if (inQuietHours(minutes, prefs.quietStart, prefs.quietEnd)) continue;
    if (!(await notifications.claim(userId, 'weekly-recap', day))) continue;
    await deliver(notifications, notifier, userId, {
      title: 'Dein Wochenrückblick ist da',
      body: `${recap.activeDays} Lerntage, ${recap.xp} XP, ${recap.wordsMatured} Wörter gefestigt.`,
      url: '/',
      tag: 'weekly-recap',
    });
  }
  log.info({ generated }, 'notifications.weekly_recaps');
  return generated;
}
