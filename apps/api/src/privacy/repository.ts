/**
 * GDPR self-service (story 4.4): everything the server keeps about a person, as one export,
 * and deleting the account with everything that belongs to it.
 *
 * Deletion relies on the foreign keys (on delete cascade: sessions, accounts, every sync
 * table, class memberships, second factor). Classes the person taught alone are archived,
 * not deleted, so learners keep a trace of them; the audit log keeps its rows with the
 * actor set to null (a legal record of who changed what, without the person).
 */
import type pg from 'pg';
import { writeAudit } from '../audit/log.js';
import { SYNC_TABLES, type SyncTableName } from '../sync/schemas.js';

export interface AccountExport {
  exportedAt: string;
  profile: Record<string, unknown>;
  secondFactorEnabled: boolean;
  sessions: Record<string, unknown>[];
  classes: Record<string, unknown>[];
  learningData: Record<SyncTableName, Record<string, unknown>[]>;
  /** What the server derived from the learning data: XP, daily quests, badges (story 5.4). */
  engagement: {
    state: Record<string, unknown> | null;
    xpLedger: Record<string, unknown>[];
    quests: Record<string, unknown>[];
    achievements: Record<string, unknown>[];
  };
  /** Reminder settings, devices with push (without their keys) and weekly recaps. */
  notifications: {
    prefs: Record<string, unknown> | null;
    devices: Record<string, unknown>[];
    recaps: Record<string, unknown>[];
  };
  /** Recognition inside classes: badges and shout-outs received, challenges helped. */
  classRecognition: {
    badges: Record<string, unknown>[];
    shoutouts: Record<string, unknown>[];
    challenges: Record<string, unknown>[];
    /** Unit certificates (story 14.3) and the weekly league choice per class (14.2). */
    certificates: Record<string, unknown>[];
    leagues: Record<string, unknown>[];
    /** Live quiz answers (kept 30 days after the quiz, story 14.4). */
    quizzes: Record<string, unknown>[];
  };
  /** al-Muʿallim: conversations (kept 90 days) and AI usage per day. */
  tutor: {
    conversations: Record<string, unknown>[];
    messages: Record<string, unknown>[];
    usage: Record<string, unknown>[];
    grades: Record<string, unknown>[];
  };
  auditLog: Record<string, unknown>[];
}

export interface PrivacyRepository {
  export(userId: string): Promise<AccountExport>;
  /** Deletes the account; returns false when it did not exist. */
  delete(userId: string, ipAddress: string | null): Promise<boolean>;
}

const iso = (row: Record<string, unknown>) => {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row))
    out[k] = v instanceof Date ? v.toISOString() : v;
  return out;
};

export class PgPrivacyRepository implements PrivacyRepository {
  constructor(private readonly pool: pg.Pool) {}

  async export(userId: string): Promise<AccountExport> {
    const q = async (sql: string) =>
      (await this.pool.query(sql, [userId])).rows.map((r) =>
        iso(r as Record<string, unknown>)
      );
    const [profile] = await q(
      `select id, email, name, role, time_zone, tutor_language, email_verified, created_at,
              updated_at
         from users where id = $1`
    );
    const learningData = {} as Record<SyncTableName, Record<string, unknown>[]>;
    for (const table of SYNC_TABLES) {
      // Table names come from the fixed schema list, never from the request.
      learningData[table] = (
        await q(`select * from "${table}" where user_id = $1 order by id`)
      ).map(({ user_id: _u, synced_at: _s, ...rest }) => rest);
    }
    return {
      exportedAt: new Date().toISOString(),
      profile: profile ?? {},
      secondFactorEnabled:
        (await q('select 1 from user_totp where user_id = $1 and enabled_at is not null'))
          .length > 0,
      // Devices without their tokens.
      sessions: await q(
        `select created_at, updated_at as last_active_at, expires_at, ip_address, user_agent
           from sessions where user_id = $1 order by created_at`
      ),
      classes: await q(
        `select c.name, m.class_role, m.status, m.joined_at, m.approved_at
           from class_members m join classes c on c.id = m.class_id
          where m.user_id = $1 order by m.joined_at`
      ),
      learningData,
      engagement: {
        state:
          (
            await q(
              `select total_xp, level, streak_current, streak_longest, shields,
                      rules_version, rejected, computed_at
                 from engagement_state where user_id = $1`
            )
          )[0] ?? null,
        xpLedger: await q(
          `select event_key, kind, points, earned_at, rules_version
             from xp_ledger where user_id = $1 order by earned_at, event_key`
        ),
        quests: await q(
          `select day::text, quest_id, progress, target, completed_at
             from quest_progress where user_id = $1 order by day, quest_id`
        ),
        achievements: await q(
          `select badge_id, tier, unlocked_at
             from achievement_unlocks where user_id = $1 order by unlocked_at, badge_id`
        ),
      },
      notifications: {
        prefs:
          (
            await q(
              `select reminder_enabled, reminder_time, quiet_start, quiet_end, weekly_recap,
                      updated_at
                 from notification_prefs where user_id = $1`
            )
          )[0] ?? null,
        devices: await q(
          `select user_agent, created_at, last_success_at
             from push_subscriptions where user_id = $1 order by created_at`
        ),
        recaps: await q(
          `select week_start::text, data from weekly_recaps
            where user_id = $1 order by week_start`
        ),
      },
      classRecognition: {
        badges: await q(
          `select c.name as class, b.name, b.message, a.awarded_at
             from teacher_badge_awards a
             join teacher_badges b on b.id = a.badge_id
             join classes c on c.id = b.class_id
            where a.user_id = $1 order by a.awarded_at`
        ),
        shoutouts: await q(
          `select c.name as class, s.message, s.created_at
             from class_shoutouts s join classes c on c.id = s.class_id
            where s.user_id = $1 order by s.created_at`
        ),
        challenges: await q(
          `select c.name as class, ch.week_start::text, ch.template, ch.target, ch.reached_at
             from class_challenge_contributors cc
             join class_challenges ch on ch.id = cc.challenge_id
             join classes c on c.id = ch.class_id
            where cc.user_id = $1 order by ch.week_start`
        ),
        certificates: await q(
          `select unit, mastery, class_name as class, teacher_name as teacher, awarded_at
             from certificates where user_id = $1 order by unit`
        ),
        leagues: await q(
          `select c.name as class, cm.league_opt_in as opted_in
             from class_members cm join classes c on c.id = cm.class_id
            where cm.user_id = $1 order by c.name`
        ),
        quizzes: await q(
          `select c.name as class, a.question, a.choice, a.correct, a.points, a.answered_at
             from live_quiz_answers a
             join live_quizzes z on z.id = a.quiz_id
             join classes c on c.id = z.class_id
            where a.user_id = $1 order by a.answered_at`
        ),
      },
      tutor: {
        conversations: await q(
          `select id, title, context, created_at, updated_at from ai_conversations
            where user_id = $1 order by created_at`
        ),
        messages: await q(
          `select m.conversation_id, m.role, m.content, m.rating, m.created_at
             from ai_messages m join ai_conversations c on c.id = m.conversation_id
            where c.user_id = $1 order by m.created_at, m.id`
        ),
        usage: await q(
          `select day::text, turns, tokens, cost_micro from ai_usage_daily
            where user_id = $1 order by day`
        ),
        grades: await q(
          `select kind, task, answer, result, status, override, created_at, reviewed_at
             from ai_grades where user_id = $1 order by created_at`
        ),
      },
      auditLog: await q(
        `select action, target_type, target_id, details, created_at,
                (actor_id = $1) as by_you
           from audit_log
          where actor_id = $1 or (target_type = 'user' and target_id = $1::text)
          order by id`
      ),
    };
  }

  async delete(userId: string, ipAddress: string | null): Promise<boolean> {
    const client = await this.pool.connect();
    try {
      await client.query('begin');
      // Classes this person teaches alone would be left without a teacher: archive them.
      await client.query(
        `update classes c set archived_at = now()
          where archived_at is null
            and exists (select 1 from class_members m
                         where m.class_id = c.id and m.user_id = $1 and m.class_role = 'teacher')
            and not exists (select 1 from class_members m
                             where m.class_id = c.id and m.user_id <> $1
                               and m.class_role = 'teacher' and m.status = 'active')`,
        [userId]
      );
      const { rowCount } = await client.query('delete from users where id = $1', [
        userId,
      ]);
      if (!rowCount) {
        await client.query('rollback');
        return false;
      }
      // Recorded without an actor: the person no longer exists.
      await writeAudit(client, {
        actorId: null,
        action: 'account.deleted',
        targetType: 'user',
        targetId: userId,
        ipAddress,
      });
      await client.query('commit');
      return true;
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
  }
}
