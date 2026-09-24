/**
 * Server copy of the engagement results (story 5.4, ADR-0016): reads the learner's synced
 * records, stores what the shared rules derive from them, and serves the totals.
 */
import type pg from 'pg';
import {
  isTimeZone,
  isWeeklyGoal,
  DEFAULT_WEEKLY_GOAL,
  LESSON_SIZES,
  type EngagementInput,
  type EngagementSummary,
  type Tier,
  type WeeklyGoal,
} from '@suffa/engagement';

export interface LearnerData {
  input: EngagementInput;
  timeZone: string;
  weeklyGoal: WeeklyGoal;
}

export interface EngagementState {
  totalXp: number;
  level: number;
  streak: { current: number; longest: number; shields: number };
  rulesVersion: number;
  /** Records that earned nothing because they failed a plausibility check. */
  rejected: number;
  computedAt: string;
  achievements: { badgeId: string; tier: Tier; unlockedAt: string }[];
}

export interface EngagementRepository {
  load(userId: string): Promise<LearnerData | null>;
  save(
    userId: string,
    summary: EngagementSummary,
    meta: { rulesVersion: number; rejected: number; computedAt: Date }
  ): Promise<void>;
  state(userId: string): Promise<EngagementState | null>;
}

/** Quest rows are kept for this many past days (teacher views look at recent weeks). */
export const QUEST_HISTORY_DAYS = 60;

const iso = (value: unknown) =>
  value instanceof Date ? value.toISOString() : (value as string | null);

export class PgEngagementRepository implements EngagementRepository {
  constructor(private readonly pool: pg.Pool) {}

  async load(userId: string): Promise<LearnerData | null> {
    const user = await this.pool.query<{
      time_zone: string | null;
      weekly: number | null;
    }>(
      `select u.time_zone, s."weeklyGoal" as weekly
         from users u left join settings s on s.user_id = u.id and not s.deleted
        where u.id = $1`,
      [userId]
    );
    const row = user.rows[0];
    if (!row) return null;
    const q = (sql: string) => this.pool.query(sql, [userId]).then((r) => r.rows);
    const [reviews, tracks, practice, checkIns, exams, enrollments] = await Promise.all([
      q(`select "cardId", rating, "durationMs", "scheduledInterval", "reviewedAt", deleted
           from review_logs where user_id = $1`),
      q(
        `select id, "lessonKey", "completedAt", deleted from media_progress where user_id = $1`
      ),
      q(
        `select id, unit, skill, "practisedAt", deleted from practice_progress where user_id = $1`
      ),
      q(`select id, "checkedAt", deleted from daily_checkins where user_id = $1`),
      q(`select format, units, score, total, "finishedAt", deleted
           from exam_results where user_id = $1`),
      q(
        `select id, unit, "dueAt", extended, deleted from unit_enrollments where user_id = $1`
      ),
    ]);
    return {
      timeZone: row.time_zone && isTimeZone(row.time_zone) ? row.time_zone : 'UTC',
      weeklyGoal: isWeeklyGoal(row.weekly) ? row.weekly : DEFAULT_WEEKLY_GOAL,
      input: {
        reviews: reviews.map((r) => ({ ...r, reviewedAt: iso(r.reviewedAt) as string })),
        tracks: tracks.map((t) => ({ ...t, completedAt: iso(t.completedAt) })),
        practice: practice.map((p) => ({
          ...p,
          practisedAt: iso(p.practisedAt) as string,
        })),
        checkIns: checkIns.map((c) => ({ ...c, checkedAt: iso(c.checkedAt) as string })),
        exams: exams.map((e) => ({ ...e, finishedAt: iso(e.finishedAt) as string })),
        enrollments: enrollments.map((e) => ({ ...e, dueAt: iso(e.dueAt) as string })),
        lessonSizes: LESSON_SIZES,
      },
    };
  }

  async save(
    userId: string,
    summary: EngagementSummary,
    meta: { rulesVersion: number; rejected: number; computedAt: Date }
  ): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('begin');
      // The ledger is a pure function of the synced data: replaced as a whole.
      await client.query('delete from xp_ledger where user_id = $1', [userId]);
      const events = summary.xpEvents;
      await client.query(
        `insert into xp_ledger (user_id, event_key, kind, points, earned_at, rules_version)
         select $1, k, kind, p, at, $6
           from unnest($2::text[], $3::text[], $4::int[], $5::timestamptz[]) as t(k, kind, p, at)
         on conflict (user_id, event_key) do nothing`,
        [
          userId,
          events.map((e) => `${e.kind}:${e.ref}`),
          events.map((e) => e.kind),
          events.map((e) => e.points),
          events.map((e) => e.at),
          meta.rulesVersion,
        ]
      );
      const recent = summary.questDays
        .slice(-QUEST_HISTORY_DAYS)
        .flatMap((d) => d.quests.map((q) => ({ day: d.day, q })));
      await client.query(
        `insert into quest_progress (user_id, day, quest_id, progress, target, completed_at)
         select $1, day, quest, progress, target, done
           from unnest($2::date[], $3::text[], $4::int[], $5::int[], $6::timestamptz[])
             as t(day, quest, progress, target, done)
         on conflict (user_id, day, quest_id) do update
           set progress = excluded.progress, target = excluded.target,
               completed_at = excluded.completed_at`,
        [
          userId,
          recent.map((r) => r.day),
          recent.map((r) => r.q.quest.id),
          recent.map((r) => r.q.progress),
          recent.map((r) => r.q.quest.target),
          recent.map((r) => r.q.doneAt),
        ]
      );
      // Badges are never taken away, even if the data behind them changes later.
      await client.query(
        `insert into achievement_unlocks (user_id, badge_id, tier, unlocked_at)
         select $1, b, t, at from unnest($2::text[], $3::text[], $4::timestamptz[]) as u(b, t, at)
         on conflict do nothing`,
        [
          userId,
          summary.achievements.map((a) => a.badgeId),
          summary.achievements.map((a) => a.tier),
          summary.achievements.map((a) => a.unlockedAt),
        ]
      );
      await client.query(
        `insert into engagement_state (user_id, total_xp, level, streak_current, streak_longest,
                                       shields, rules_version, rejected, computed_at)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         on conflict (user_id) do update set
           total_xp = excluded.total_xp, level = excluded.level,
           streak_current = excluded.streak_current, streak_longest = excluded.streak_longest,
           shields = excluded.shields, rules_version = excluded.rules_version,
           rejected = excluded.rejected, computed_at = excluded.computed_at`,
        [
          userId,
          summary.totalXp,
          summary.level.level,
          summary.streak.current,
          summary.streak.longest,
          summary.streak.shields,
          meta.rulesVersion,
          meta.rejected,
          meta.computedAt,
        ]
      );
      await client.query('commit');
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
  }

  async state(userId: string): Promise<EngagementState | null> {
    const [state, unlocks] = await Promise.all([
      this.pool.query('select * from engagement_state where user_id = $1', [userId]),
      this.pool.query(
        `select badge_id, tier, unlocked_at from achievement_unlocks
          where user_id = $1 order by unlocked_at, badge_id`,
        [userId]
      ),
    ]);
    const row = state.rows[0];
    if (!row) return null;
    return {
      totalXp: row.total_xp,
      level: row.level,
      streak: {
        current: row.streak_current,
        longest: row.streak_longest,
        shields: row.shields,
      },
      rulesVersion: row.rules_version,
      rejected: row.rejected,
      computedAt: iso(row.computed_at) as string,
      achievements: unlocks.rows.map((u) => ({
        badgeId: u.badge_id,
        tier: u.tier,
        unlockedAt: iso(u.unlocked_at) as string,
      })),
    };
  }
}
