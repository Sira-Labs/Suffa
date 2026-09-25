/**
 * Weekly class league (story 14.2): learners who opted in are ranked by how much of their own
 * weekly goal (3, 5 or 7 active days) they reached this week, not by raw XP, so beginners can
 * win. Only the top three are named, with a title; nobody is ever shown as last. The week is
 * each learner's own Monday-to-Sunday in their time zone, as for the weekly goal.
 */
import type pg from 'pg';
import { DEFAULT_WEEKLY_GOAL, isWeeklyGoal } from '@suffa/engagement';
import { writeAudit } from '../audit/log.js';
import { inTransaction } from '../db/transaction.js';

export const PODIUM_SIZE = 3;
export const PODIUM_TITLES = ['Wochen-Stern', 'Wochen-Held', 'Wochen-Talent'] as const;

export interface LeagueEntry {
  userId: string;
  name: string | null;
  activeDays: number;
  goal: number;
}

export interface PodiumPlace {
  place: number;
  title: string;
  name: string;
  percent: number;
  you: boolean;
}

export interface LeagueView {
  enabled: boolean;
  minors: boolean;
  /** The caller's own choice (null for teachers, who are not ranked). */
  optedIn: boolean | null;
  participants: number;
  podium: PodiumPlace[];
  /** The caller's own week, when they take part. */
  you: { percent: number; activeDays: number; goal: number; onPodium: boolean } | null;
}

export interface LeagueSettings {
  enabled: boolean;
  minors: boolean;
}

/** Share of the weekly goal reached, in whole percent, at most 100. */
export function goalPercent(activeDays: number, goal: number): number {
  if (goal <= 0) return 0;
  return Math.min(100, Math.floor((activeDays * 100) / goal));
}

/** First name only (for classes of minors); falls back to a neutral label. */
export function displayName(name: string | null, minors: boolean): string {
  const trimmed = name?.trim();
  if (!trimmed) return 'Jemand aus der Klasse';
  return minors ? (trimmed.split(/\s+/)[0] as string) : trimmed;
}

/**
 * The podium: places by percent (ties share a place, so two learners at 100 % are both
 * first), only learners with some progress, at most three places.
 */
export function rankLeague(
  entries: readonly LeagueEntry[],
  callerId: string,
  minors: boolean
): Pick<LeagueView, 'podium' | 'you' | 'participants'> {
  const scored = entries
    .map((e) => ({ ...e, percent: goalPercent(e.activeDays, e.goal) }))
    .sort(
      (a, b) =>
        b.percent - a.percent ||
        displayName(a.name, minors).localeCompare(displayName(b.name, minors), 'de')
    );
  const podium: PodiumPlace[] = [];
  let place = 0;
  let lastPercent: number | null = null;
  for (const e of scored) {
    if (e.percent === 0) break;
    if (e.percent !== lastPercent) {
      place++;
      lastPercent = e.percent;
    }
    if (place > PODIUM_SIZE) break;
    podium.push({
      place,
      title: PODIUM_TITLES[place - 1] as string,
      name: displayName(e.name, minors),
      percent: e.percent,
      you: e.userId === callerId,
    });
  }
  const mine = scored.find((e) => e.userId === callerId);
  return {
    participants: entries.length,
    podium,
    you: mine
      ? {
          percent: mine.percent,
          activeDays: mine.activeDays,
          goal: mine.goal,
          onPodium: podium.some((p) => p.you),
        }
      : null,
  };
}

export interface ClassLeagueRepository {
  view(classId: string, callerId: string): Promise<LeagueView>;
  settings(classId: string): Promise<LeagueSettings>;
  updateSettings(
    actor: { id: string; ip: string | null },
    classId: string,
    settings: LeagueSettings
  ): Promise<void>;
  /** False when the caller is no learner of the class. */
  setOptIn(classId: string, userId: string, optIn: boolean): Promise<boolean>;
}

export class PgClassLeagueRepository implements ClassLeagueRepository {
  constructor(
    private readonly pool: pg.Pool,
    private readonly now: () => Date = () => new Date()
  ) {}

  async settings(classId: string): Promise<LeagueSettings> {
    const { rows } = await this.pool.query(
      'select league_enabled, minors from classes where id = $1',
      [classId]
    );
    return {
      enabled: rows[0]?.league_enabled ?? false,
      minors: rows[0]?.minors ?? false,
    };
  }

  async updateSettings(
    actor: { id: string; ip: string | null },
    classId: string,
    settings: LeagueSettings
  ) {
    await inTransaction(this.pool, async (db) => {
      await db.query(
        'update classes set league_enabled = $2, minors = $3 where id = $1',
        [classId, settings.enabled, settings.minors]
      );
      await writeAudit(db, {
        actorId: actor.id,
        action: 'class.league.settings',
        targetType: 'class',
        targetId: classId,
        details: { ...settings },
        ipAddress: actor.ip,
      });
    });
  }

  async setOptIn(classId: string, userId: string, optIn: boolean): Promise<boolean> {
    const { rowCount } = await this.pool.query(
      `update class_members set league_opt_in = $3
        where class_id = $1 and user_id = $2 and status = 'active' and class_role = 'student'`,
      [classId, userId, optIn]
    );
    return (rowCount ?? 0) > 0;
  }

  async view(classId: string, callerId: string): Promise<LeagueView> {
    const settings = await this.settings(classId);
    const own = await this.pool.query(
      `select league_opt_in from class_members
        where class_id = $1 and user_id = $2 and status = 'active' and class_role = 'student'`,
      [classId, callerId]
    );
    const optedIn: boolean | null = own.rows[0] ? own.rows[0].league_opt_in : null;
    if (!settings.enabled) {
      return { ...settings, optedIn, participants: 0, podium: [], you: null };
    }
    // Each learner's week runs Monday to today in their own time zone.
    const { rows } = await this.pool.query<{
      id: string;
      name: string | null;
      weekly: number | null;
      active_days: number;
    }>(
      `with m as (
         select u.id, u.name, s."weeklyGoal" as weekly,
                ($2::timestamptz at time zone coalesce(u.time_zone, 'UTC'))::date as today
           from class_members cm
           join users u on u.id = cm.user_id
           left join settings s on s.user_id = u.id and not s.deleted
          where cm.class_id = $1 and cm.status = 'active' and cm.class_role = 'student'
            and cm.league_opt_in
       )
       select m.id, m.name, m.weekly,
              (select count(distinct q.day)::int from quest_progress q
                where q.user_id = m.id and q.completed_at is not null
                  and q.day between date_trunc('week', m.today)::date and m.today
              ) as active_days
         from m`,
      [classId, this.now()]
    );
    const entries: LeagueEntry[] = rows.map((r) => ({
      userId: r.id,
      name: r.name,
      activeDays: r.active_days,
      goal: isWeeklyGoal(r.weekly) ? r.weekly : DEFAULT_WEEKLY_GOAL,
    }));
    return { ...settings, optedIn, ...rankLeague(entries, callerId, settings.minors) };
  }
}
