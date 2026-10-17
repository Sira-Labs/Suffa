/**
 * Invite links for one live session (story: invite to a video call). The teacher shares a link
 * or its QR code; it works while the session is planned or live, until its end plus the
 * overrun. Opening it, a member of the class goes to the session; anyone else asks to join the
 * class like with the class's invite link (pending until the teacher approves), and can take
 * part once approved. The class's own invite link is left as it is.
 */
import { randomBytes } from 'node:crypto';
import type pg from 'pg';
import { writeAudit } from '../audit/log.js';
import { hashToken, type MemberStatus } from '../classes/repository.js';
import { inTransaction } from '../db/transaction.js';
import { MISSED_HOURS, OVERRUN_MINUTES, type LiveActor } from './repository.js';

export interface LiveInvitePreview {
  classId: string;
  className: string;
  teacherName: string | null;
  sessionId: string;
  title: string;
  startsAt: string;
  status: 'scheduled' | 'live';
}

export type LiveInviteJoin =
  | { ok: true; classId: string; sessionId: string; status: MemberStatus }
  | { ok: false; reason: 'invalid_invite' };

export interface LiveInviteRepository {
  /** A new link for the session (replacing an older one); null when it is over or gone. */
  create(
    actor: LiveActor,
    classId: string,
    sessionId: string
  ): Promise<{ token: string; expiresAt: string } | null>;
  preview(token: string): Promise<LiveInvitePreview | null>;
  /** Joins the session's class as a learner (pending) unless already a member. */
  join(actor: LiveActor, token: string): Promise<LiveInviteJoin>;
}

/**
 * When a session's link stops working: a live session at its end plus the overrun (as its
 * room), a planned one when it is no longer listed (its planned end plus MISSED_HOURS).
 */
const EXPIRES = `case when s.status = 'live'
  then s.started_at + make_interval(mins => s.duration_minutes + ${OVERRUN_MINUTES})
  else s.starts_at + make_interval(hours => ${MISSED_HOURS}, mins => s.duration_minutes)
  end`;

export class PgLiveInviteRepository implements LiveInviteRepository {
  constructor(
    private readonly pool: pg.Pool,
    private readonly now: () => Date = () => new Date()
  ) {}

  async create(actor: LiveActor, classId: string, sessionId: string) {
    const token = randomBytes(24).toString('base64url');
    return inTransaction(this.pool, async (db) => {
      const { rows } = await db.query<{ expires_at: Date }>(
        `select ${EXPIRES} as expires_at
           from live_sessions s join classes c on c.id = s.class_id
          where s.id = $1 and s.class_id = $2 and s.status in ('scheduled', 'live')
            and c.archived_at is null`,
        [sessionId, classId]
      );
      const session = rows[0];
      if (!session || session.expires_at <= this.now()) return null;
      await db.query(
        `insert into live_invites (token_hash, session_id, created_by) values ($1, $2, $3)
         on conflict (session_id) do update
           set token_hash = excluded.token_hash, created_by = excluded.created_by,
               created_at = now()`,
        [hashToken(token), sessionId, actor.id]
      );
      await writeAudit(db, {
        actorId: actor.id,
        action: 'live.invite_created',
        targetType: 'live_session',
        targetId: sessionId,
        ipAddress: actor.ip,
        details: { classId },
      });
      return { token, expiresAt: session.expires_at.toISOString() };
    });
  }

  async preview(token: string): Promise<LiveInvitePreview | null> {
    const { rows } = await this.pool.query<{
      class_id: string;
      class_name: string;
      teacher_name: string | null;
      session_id: string;
      title: string;
      starts_at: Date;
      status: 'scheduled' | 'live';
    }>(
      `select c.id as class_id, c.name as class_name,
              (select coalesce(nullif(u.name, ''), split_part(u.email, '@', 1))
                 from users u where u.id = c.created_by) as teacher_name,
              s.id as session_id, s.title, s.starts_at, s.status
         from live_invites i
         join live_sessions s on s.id = i.session_id
         join classes c on c.id = s.class_id
        where i.token_hash = $1 and s.status in ('scheduled', 'live')
          and c.archived_at is null and ${EXPIRES} > $2`,
      [hashToken(token), this.now()]
    );
    const r = rows[0];
    return r
      ? {
          classId: r.class_id,
          className: r.class_name,
          teacherName: r.teacher_name,
          sessionId: r.session_id,
          title: r.title,
          startsAt: r.starts_at.toISOString(),
          status: r.status,
        }
      : null;
  }

  async join(actor: LiveActor, token: string): Promise<LiveInviteJoin> {
    const invite = await this.preview(token);
    if (!invite) return { ok: false, reason: 'invalid_invite' };
    return inTransaction(this.pool, async (db) => {
      // As with the class's link: an existing membership (or teacher role) stays as it is.
      const { rows } = await db.query<{ status: MemberStatus; inserted: boolean }>(
        `insert into class_members (class_id, user_id, class_role, status)
         values ($1, $2, 'student', 'pending')
         on conflict (class_id, user_id) do update set class_id = excluded.class_id
         returning status, (xmax = 0) as inserted`,
        [invite.classId, actor.id]
      );
      const row = rows[0]!;
      if (row.inserted) {
        await writeAudit(db, {
          actorId: actor.id,
          action: 'class.join_requested',
          targetType: 'class',
          targetId: invite.classId,
          ipAddress: actor.ip,
          details: { via: 'live_invite', sessionId: invite.sessionId },
        });
      }
      return {
        ok: true,
        classId: invite.classId,
        sessionId: invite.sessionId,
        status: row.status,
      };
    });
  }
}
