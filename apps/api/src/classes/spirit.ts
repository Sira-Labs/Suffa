/**
 * Class spirit (story 6.2): the weekly class challenge, badges the teacher creates and
 * awards, and shout-outs. Everything cooperative: the challenge is one shared target, no
 * ranking; when it is reached, everyone who helped earns the "Rūḥ al-Faṣl" badge.
 */
import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { weekStart, dayKey, BADGES } from '@suffa/engagement';
import { writeAudit } from '../audit/log.js';
import { inTransaction } from '../db/transaction.js';

export const CHALLENGE_TEMPLATES = ['reviews', 'quests', 'xp', 'active-days'] as const;
export type ChallengeTemplate = (typeof CHALLENGE_TEMPLATES)[number];

/** Icons a teacher can pick for a badge (names of the app's icon set). */
export const BADGE_ICONS = [
  'award',
  'flame',
  'read',
  'write',
  'speak',
  'listen',
  'roots',
  'check',
] as const;
export type BadgeIcon = (typeof BADGE_ICONS)[number];

/** Thresholds of the class badge (reached challenges one helped with). */
const RUH_THRESHOLDS =
  BADGES.find((b) => b.id === 'ruh')?.thresholds ?? ([1, 5, 10] as const);
const TIERS = ['bronze', 'silver', 'gold'] as const;

export interface Challenge {
  id: string;
  template: ChallengeTemplate;
  target: number;
  weekStart: string;
  progress: number;
  reached: boolean;
  /** Learners who contributed so far. */
  contributors: number;
  /** What the reading learner added (null for teachers). */
  yours: number | null;
}

export interface Shoutout {
  id: string;
  message: string;
  author: string | null;
  /** Learner it is addressed to, null = the whole class. */
  to: string | null;
  toYou: boolean;
  createdAt: string;
}

export interface TeacherBadge {
  id: string;
  name: string;
  icon: BadgeIcon;
  message: string;
  awards: { userId: string; name: string | null; you: boolean; awardedAt: string }[];
}

export interface ClassFeed {
  challenge: Challenge | null;
  shoutouts: Shoutout[];
  badges: TeacherBadge[];
}

export interface Actor {
  id: string;
  ip: string | null;
}

export interface ClassSpiritRepository {
  feed(classId: string, viewerId: string): Promise<ClassFeed>;
  setChallenge(
    actor: Actor,
    classId: string,
    challenge: { template: ChallengeTemplate; target: number; timeZone: string }
  ): Promise<Challenge>;
  removeChallenge(actor: Actor, classId: string): Promise<boolean>;
  createBadge(
    actor: Actor,
    classId: string,
    badge: { name: string; icon: BadgeIcon; message: string }
  ): Promise<TeacherBadge>;
  award(actor: Actor, classId: string, badgeId: string, userId: string): Promise<boolean>;
  shoutout(
    actor: Actor,
    classId: string,
    shout: { message: string; userId: string | null }
  ): Promise<Shoutout | null>;
  removeShoutout(actor: Actor, classId: string, shoutoutId: string): Promise<boolean>;
}

/** Latest shout-outs shown in the feed. */
export const FEED_SHOUTOUTS = 20;

const STUDENTS = `select user_id from class_members
                   where class_id = $1 and status = 'active' and class_role = 'student'`;

/** Per learner, what counts for a template in [start, end). $1 class, $2 start, $3 end. */
const CONTRIBUTIONS: Record<ChallengeTemplate, string> = {
  reviews: `select user_id, count(*)::int as value from review_logs
             where user_id in (${STUDENTS}) and not deleted
               and "reviewedAt" >= $2 and "reviewedAt" < $3 group by user_id`,
  quests: `select user_id, count(*)::int as value from quest_progress
            where user_id in (${STUDENTS}) and completed_at >= $2 and completed_at < $3
            group by user_id`,
  xp: `select user_id, sum(points)::int as value from xp_ledger
        where user_id in (${STUDENTS}) and earned_at >= $2 and earned_at < $3
        group by user_id`,
  'active-days': `select user_id, count(distinct day)::int as value from quest_progress
                   where user_id in (${STUDENTS}) and completed_at >= $2 and completed_at < $3
                   group by user_id`,
};

const displayName = (name: string | null, email: string | null) =>
  name || (email ? email.split('@')[0]! : null);

export class PgClassSpiritRepository implements ClassSpiritRepository {
  constructor(
    private readonly pool: pg.Pool,
    private readonly now: () => Date = () => new Date()
  ) {}

  async feed(classId: string, viewerId: string): Promise<ClassFeed> {
    const [challenge, shoutouts, badges] = await Promise.all([
      this.currentChallenge(classId, viewerId),
      this.pool.query(
        `select s.id, s.message, s.created_at, s.user_id,
                a.name as author_name, a.email as author_email,
                t.name as to_name, t.email as to_email
           from class_shoutouts s
           left join users a on a.id = s.author_id
           left join users t on t.id = s.user_id
          where s.class_id = $1
          order by s.created_at desc limit ${FEED_SHOUTOUTS}`,
        [classId]
      ),
      this.badges(classId, viewerId),
    ]);
    return {
      challenge,
      badges,
      shoutouts: shoutouts.rows.map((r) => ({
        id: r.id,
        message: r.message,
        author: displayName(r.author_name, r.author_email),
        to: r.user_id ? displayName(r.to_name, r.to_email) : null,
        toYou: r.user_id === viewerId,
        createdAt: r.created_at.toISOString(),
      })),
    };
  }

  /** This week's challenge with its progress; settles it (badges) once reached. */
  private async currentChallenge(
    classId: string,
    viewerId: string
  ): Promise<Challenge | null> {
    const { rows } = await this.pool.query(
      `select id, template, target, week_start::text, reached_at,
              (week_start::timestamp at time zone time_zone) as starts,
              (week_start::timestamp at time zone time_zone) + interval '7 days' as ends
         from class_challenges
        where class_id = $1
          and $2 >= (week_start::timestamp at time zone time_zone)
          and $2 < (week_start::timestamp at time zone time_zone) + interval '7 days'
        order by week_start desc limit 1`,
      [classId, this.now()]
    );
    const row = rows[0];
    if (!row) return null;
    const template = row.template as ChallengeTemplate;
    const contributions = await this.pool.query<{ user_id: string; value: number }>(
      CONTRIBUTIONS[template],
      [classId, row.starts, row.ends]
    );
    const progress = contributions.rows.reduce((sum, c) => sum + c.value, 0);
    const helpers = contributions.rows.filter((c) => c.value > 0).map((c) => c.user_id);
    let reached = row.reached_at !== null;
    if (!reached && progress >= row.target) {
      await this.settle(row.id, helpers);
      reached = true;
    }
    const mine = contributions.rows.find((c) => c.user_id === viewerId);
    const isStudent = await this.pool.query(
      `select 1 from class_members where class_id = $1 and user_id = $2
          and class_role = 'student' and status = 'active'`,
      [classId, viewerId]
    );
    return {
      id: row.id,
      template,
      target: row.target,
      weekStart: row.week_start,
      progress,
      reached,
      contributors: helpers.length,
      yours: isStudent.rows.length > 0 ? (mine?.value ?? 0) : null,
    };
  }

  /** Marks a challenge reached once and gives its helpers the class badge tiers they earned. */
  private async settle(challengeId: string, helpers: string[]): Promise<void> {
    await inTransaction(this.pool, async (client) => {
      const marked = await client.query(
        'update class_challenges set reached_at = $2 where id = $1 and reached_at is null',
        [challengeId, this.now()]
      );
      if (marked.rowCount === 0) return; // settled by a concurrent reader
      await client.query(
        `insert into class_challenge_contributors (challenge_id, user_id)
         select $1, unnest($2::uuid[]) on conflict do nothing`,
        [challengeId, helpers]
      );
      const counts = await client.query<{ user_id: string; n: number }>(
        `select c.user_id, count(*)::int as n
           from class_challenge_contributors c
           join class_challenges ch on ch.id = c.challenge_id and ch.reached_at is not null
          where c.user_id = any($1::uuid[])
          group by c.user_id`,
        [helpers]
      );
      for (const { user_id, n } of counts.rows) {
        const tiers = RUH_THRESHOLDS.flatMap((threshold, i) =>
          n >= threshold ? [TIERS[i]!] : []
        );
        await client.query(
          `insert into achievement_unlocks (user_id, badge_id, tier, unlocked_at)
           select $1, 'ruh', unnest($2::text[]), $3 on conflict do nothing`,
          [user_id, tiers, this.now()]
        );
      }
    });
  }

  private async badges(classId: string, viewerId: string): Promise<TeacherBadge[]> {
    const { rows } = await this.pool.query(
      `select b.id, b.name, b.icon, b.message, b.created_at,
              a.user_id, a.awarded_at, u.name as user_name, u.email as user_email
         from teacher_badges b
         left join teacher_badge_awards a on a.badge_id = b.id
         left join users u on u.id = a.user_id
        where b.class_id = $1
        order by b.created_at, a.awarded_at`,
      [classId]
    );
    const byId = new Map<string, TeacherBadge>();
    for (const r of rows) {
      const badge: TeacherBadge = byId.get(r.id) ?? {
        id: r.id,
        name: r.name,
        icon: r.icon,
        message: r.message,
        awards: [],
      };
      if (r.user_id) {
        badge.awards.push({
          userId: r.user_id,
          name: displayName(r.user_name, r.user_email),
          you: r.user_id === viewerId,
          awardedAt: r.awarded_at.toISOString(),
        });
      }
      byId.set(r.id, badge);
    }
    return [...byId.values()];
  }

  async setChallenge(
    actor: Actor,
    classId: string,
    challenge: { template: ChallengeTemplate; target: number; timeZone: string }
  ): Promise<Challenge> {
    const week = weekStart(dayKey(this.now(), challenge.timeZone));
    await inTransaction(this.pool, async (client) => {
      await client.query(
        `insert into class_challenges
           (id, class_id, week_start, time_zone, template, target, created_by)
         values ($1, $2, $3, $4, $5, $6, $7)
         on conflict (class_id, week_start) do update
           set template = excluded.template, target = excluded.target,
               time_zone = excluded.time_zone, reached_at = null`,
        [
          randomUUID(),
          classId,
          week,
          challenge.timeZone,
          challenge.template,
          challenge.target,
          actor.id,
        ]
      );
      // A changed target is a new challenge: helpers are counted when it is reached.
      await client.query(
        `delete from class_challenge_contributors
          where challenge_id = (select id from class_challenges
                                 where class_id = $1 and week_start = $2)`,
        [classId, week]
      );
      await writeAudit(client, {
        actorId: actor.id,
        action: 'class.challenge_set',
        targetType: 'class',
        targetId: classId,
        details: { template: challenge.template, target: challenge.target, week },
        ipAddress: actor.ip,
      });
    });
    return (await this.currentChallenge(classId, actor.id))!;
  }

  async removeChallenge(actor: Actor, classId: string): Promise<boolean> {
    return inTransaction(this.pool, async (client) => {
      const { rowCount } = await client.query(
        `delete from class_challenges
          where class_id = $1 and reached_at is null
            and $2 >= (week_start::timestamp at time zone time_zone)
            and $2 < (week_start::timestamp at time zone time_zone) + interval '7 days'`,
        [classId, this.now()]
      );
      if (!rowCount) return false;
      await writeAudit(client, {
        actorId: actor.id,
        action: 'class.challenge_removed',
        targetType: 'class',
        targetId: classId,
        ipAddress: actor.ip,
      });
      return true;
    });
  }

  async createBadge(
    actor: Actor,
    classId: string,
    badge: { name: string; icon: BadgeIcon; message: string }
  ): Promise<TeacherBadge> {
    const id = randomUUID();
    await inTransaction(this.pool, async (client) => {
      await client.query(
        `insert into teacher_badges (id, class_id, name, icon, message, created_by)
         values ($1, $2, $3, $4, $5, $6)`,
        [id, classId, badge.name, badge.icon, badge.message, actor.id]
      );
      await writeAudit(client, {
        actorId: actor.id,
        action: 'class.badge_created',
        targetType: 'class',
        targetId: classId,
        details: { badgeId: id, name: badge.name },
        ipAddress: actor.ip,
      });
    });
    return { id, ...badge, awards: [] };
  }

  async award(
    actor: Actor,
    classId: string,
    badgeId: string,
    userId: string
  ): Promise<boolean> {
    return inTransaction(this.pool, async (client) => {
      // Only badges of this class, only to its active learners.
      const { rowCount } = await client.query(
        `insert into teacher_badge_awards (badge_id, user_id, awarded_by)
         select b.id, m.user_id, $4
           from teacher_badges b
           join class_members m on m.class_id = b.class_id
          where b.id = $1 and b.class_id = $2 and m.user_id = $3
            and m.status = 'active' and m.class_role = 'student'
         on conflict do nothing`,
        [badgeId, classId, userId, actor.id]
      );
      const known = await client.query(
        `select 1 from teacher_badge_awards a join teacher_badges b on b.id = a.badge_id
          where a.badge_id = $1 and b.class_id = $2 and a.user_id = $3`,
        [badgeId, classId, userId]
      );
      if (known.rows.length === 0) return false;
      if (rowCount) {
        await writeAudit(client, {
          actorId: actor.id,
          action: 'class.badge_awarded',
          targetType: 'user',
          targetId: userId,
          details: { classId, badgeId },
          ipAddress: actor.ip,
        });
      }
      return true;
    });
  }

  async shoutout(
    actor: Actor,
    classId: string,
    shout: { message: string; userId: string | null }
  ): Promise<Shoutout | null> {
    return inTransaction(this.pool, async (client) => {
      if (shout.userId) {
        const member = await client.query(
          `select 1 from class_members where class_id = $1 and user_id = $2
              and status = 'active' and class_role = 'student'`,
          [classId, shout.userId]
        );
        if (member.rows.length === 0) return null;
      }
      const id = randomUUID();
      const { rows } = await client.query(
        `insert into class_shoutouts (id, class_id, author_id, user_id, message)
         values ($1, $2, $3, $4, $5) returning created_at`,
        [id, classId, actor.id, shout.userId, shout.message]
      );
      await writeAudit(client, {
        actorId: actor.id,
        action: 'class.shoutout',
        targetType: 'class',
        targetId: classId,
        details: { shoutoutId: id, to: shout.userId },
        ipAddress: actor.ip,
      });
      const names = await client.query(
        `select id, name, email from users where id = any($1::uuid[])`,
        [[actor.id, shout.userId].filter(Boolean)]
      );
      const nameOf = (userId: string | null) => {
        const u = names.rows.find((r) => r.id === userId);
        return u ? displayName(u.name, u.email) : null;
      };
      return {
        id,
        message: shout.message,
        author: nameOf(actor.id),
        to: shout.userId ? nameOf(shout.userId) : null,
        toYou: false,
        createdAt: rows[0].created_at.toISOString(),
      };
    });
  }

  async removeShoutout(actor: Actor, classId: string, shoutoutId: string) {
    return inTransaction(this.pool, async (client) => {
      const { rowCount } = await client.query(
        'delete from class_shoutouts where id = $1 and class_id = $2',
        [shoutoutId, classId]
      );
      if (!rowCount) return false;
      await writeAudit(client, {
        actorId: actor.id,
        action: 'class.shoutout_removed',
        targetType: 'class',
        targetId: classId,
        details: { shoutoutId },
        ipAddress: actor.ip,
      });
      return true;
    });
  }
}
