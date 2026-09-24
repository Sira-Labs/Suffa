/**
 * Class dashboard (story 6.1): what a teacher sees about the active learners of a class
 * they teach. Aggregates only; the learners' raw records never leave the server. Content
 * ids (words) are resolved to units and texts by the teacher's app.
 */
import type pg from 'pg';

/** The dashboard looks at the last seven days (rolling, independent of time zones). */
export const PROGRESS_WINDOW_DAYS = 7;
/** Leech words listed for the class. */
export const LEECH_LIMIT = 20;

export interface StudentProgress {
  userId: string;
  name: string | null;
  email: string | null;
  lastActiveAt: string | null;
  /** From the last server recompute (after the learner's last sync). */
  streak: number;
  totalXp: number;
  xpWeek: number;
  questsWeek: number;
  activeDaysWeek: number;
  matureWords: number;
  /** Highest unit started. */
  currentUnit: number | null;
}

export interface ClassProgress {
  since: string;
  students: StudentProgress[];
  /** contentRef → learners with a mature card for it (class mastery per unit). */
  matureByRef: Record<string, number>;
  /** Words the most learners struggle with (leech cards). */
  leeches: { contentRef: string; learners: number }[];
}

export interface ClassProgressRepository {
  progress(classId: string): Promise<ClassProgress>;
}

const iso = (value: Date | null) => (value ? value.toISOString() : null);

export class PgClassProgressRepository implements ClassProgressRepository {
  constructor(
    private readonly pool: pg.Pool,
    private readonly now: () => Date = () => new Date()
  ) {}

  async progress(classId: string): Promise<ClassProgress> {
    const since = new Date(this.now().getTime() - PROGRESS_WINDOW_DAYS * 86_400_000);
    const students = `select user_id from class_members
                       where class_id = $1 and status = 'active' and class_role = 'student'`;
    const [rows, mature, leeches] = await Promise.all([
      this.pool.query(
        `select u.id, u.name, u.email,
                coalesce(es.streak_current, 0) as streak,
                coalesce(es.total_xp, 0) as total_xp,
                (select coalesce(sum(points), 0)::int from xp_ledger x
                  where x.user_id = u.id and x.earned_at >= $2) as xp_week,
                (select count(*)::int from quest_progress q
                  where q.user_id = u.id and q.completed_at >= $2) as quests_week,
                (select count(distinct day)::int from quest_progress q
                  where q.user_id = u.id and q.completed_at >= $2) as active_days,
                greatest(
                  (select max("reviewedAt") from review_logs r
                    where r.user_id = u.id and not r.deleted),
                  (select max("practisedAt") from practice_progress p
                    where p.user_id = u.id and not p.deleted),
                  (select max("completedAt") from media_progress m
                    where m.user_id = u.id and not m.deleted)
                ) as last_active,
                (select count(distinct "contentRef")::int from srs_cards c
                  where c.user_id = u.id and not c.deleted and c.interval >= 21) as mature,
                (select max(unit) from unit_enrollments e
                  where e.user_id = u.id and not e.deleted) as current_unit
           from (${students}) s
           join users u on u.id = s.user_id
           left join engagement_state es on es.user_id = u.id
          order by coalesce(nullif(u.name, ''), u.email)`,
        [classId, since]
      ),
      this.pool.query(
        `select "contentRef" as ref, count(distinct user_id)::int as n from srs_cards
          where user_id in (${students}) and not deleted and interval >= 21
          group by "contentRef"`,
        [classId]
      ),
      this.pool.query(
        `select "contentRef" as ref, count(distinct user_id)::int as n from srs_cards
          where user_id in (${students}) and not deleted and leech
          group by "contentRef" order by n desc, "contentRef" limit ${LEECH_LIMIT}`,
        [classId]
      ),
    ]);
    return {
      since: since.toISOString(),
      students: rows.rows.map((r) => ({
        userId: r.id,
        name: r.name || null,
        email: r.email,
        lastActiveAt: iso(r.last_active),
        streak: r.streak,
        totalXp: r.total_xp,
        xpWeek: r.xp_week,
        questsWeek: r.quests_week,
        activeDaysWeek: r.active_days,
        matureWords: r.mature,
        currentUnit: r.current_unit,
      })),
      matureByRef: Object.fromEntries(mature.rows.map((r) => [r.ref, r.n])),
      leeches: leeches.rows.map((r) => ({ contentRef: r.ref, learners: r.n })),
    };
  }
}
