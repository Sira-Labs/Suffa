/**
 * Classes, members and invites (story 4.3). Invite tokens are random and only their SHA-256
 * is stored; a class has at most one usable invite at a time. Membership changes are
 * audit-logged in the same transaction.
 */
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type pg from 'pg';
import { writeAudit } from '../audit/log.js';
import type { ClassScope } from '../authz/policies.js';

export type ClassRole = 'teacher' | 'student';
export type MemberStatus = 'pending' | 'active';

export interface ClassSummary {
  id: string;
  name: string;
  classRole: ClassRole;
  status: MemberStatus;
  /** Active learners (for teachers). */
  studentCount: number;
  /** Learners waiting for approval (for teachers). */
  pendingCount: number;
  createdAt: string;
}

export interface Member {
  userId: string;
  email: string | null;
  name: string | null;
  classRole: ClassRole;
  status: MemberStatus;
  joinedAt: string;
}

export interface InvitePreview {
  classId: string;
  className: string;
  teacherName: string | null;
}

export type JoinResult =
  | { ok: true; classId: string; className: string; status: MemberStatus }
  | { ok: false; reason: 'invalid_invite' };

export interface Actor {
  id: string;
  ip: string | null;
}

export const INVITE_TTL_MS = 14 * 24 * 60 * 60 * 1000;

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export interface ClassRepository {
  create(actor: Actor, name: string): Promise<ClassSummary>;
  listFor(userId: string): Promise<ClassSummary[]>;
  /** How the user relates to the class (for the policies). */
  scope(classId: string, userId: string): Promise<ClassScope>;
  /** A new invite token (revokes the old one); returned once, stored hashed. */
  createInvite(
    actor: Actor,
    classId: string
  ): Promise<{ token: string; expiresAt: string }>;
  members(classId: string): Promise<Member[]>;
  approve(actor: Actor, classId: string, userId: string): Promise<boolean>;
  remove(actor: Actor, classId: string, userId: string): Promise<boolean>;
  preview(token: string): Promise<InvitePreview | null>;
  join(actor: Actor, token: string): Promise<JoinResult>;
}

type Tx = pg.PoolClient;

export class PgClassRepository implements ClassRepository {
  constructor(
    private readonly pool: pg.Pool,
    private readonly now: () => Date = () => new Date()
  ) {}

  private async tx<T>(work: (client: Tx) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('begin');
      const result = await work(client);
      await client.query('commit');
      return result;
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
  }

  async create(actor: Actor, name: string): Promise<ClassSummary> {
    const id = randomUUID();
    await this.tx(async (client) => {
      await client.query(
        'insert into classes (id, name, created_by) values ($1, $2, $3)',
        [id, name, actor.id]
      );
      await client.query(
        `insert into class_members (class_id, user_id, class_role, status, approved_at)
         values ($1, $2, 'teacher', 'active', now())`,
        [id, actor.id]
      );
      await writeAudit(client, {
        actorId: actor.id,
        action: 'class.created',
        targetType: 'class',
        targetId: id,
        details: { name },
        ipAddress: actor.ip,
      });
    });
    const created = (await this.listFor(actor.id)).find((c) => c.id === id);
    return created!;
  }

  async listFor(userId: string): Promise<ClassSummary[]> {
    const { rows } = await this.pool.query<{
      id: string;
      name: string;
      class_role: ClassRole;
      status: MemberStatus;
      student_count: string;
      pending_count: string;
      created_at: Date;
    }>(
      `select c.id, c.name, m.class_role, m.status, c.created_at,
              (select count(*) from class_members s
                where s.class_id = c.id and s.class_role = 'student' and s.status = 'active')
                as student_count,
              (select count(*) from class_members s
                where s.class_id = c.id and s.status = 'pending') as pending_count
         from class_members m join classes c on c.id = m.class_id
        where m.user_id = $1 and c.archived_at is null
        order by c.created_at desc`,
      [userId]
    );
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      classRole: r.class_role,
      status: r.status,
      // Learners do not see who else is in the class (ADR-0009).
      studentCount: r.class_role === 'teacher' ? Number(r.student_count) : 0,
      pendingCount: r.class_role === 'teacher' ? Number(r.pending_count) : 0,
      createdAt: r.created_at.toISOString(),
    }));
  }

  async scope(classId: string, userId: string): Promise<ClassScope> {
    const { rows } = await this.pool.query<{ class_role: ClassRole }>(
      `select class_role from class_members
        where class_id = $1 and user_id = $2 and status = 'active'`,
      [classId, userId]
    );
    return { classRole: rows[0]?.class_role ?? null };
  }

  async createInvite(actor: Actor, classId: string) {
    const token = randomBytes(24).toString('base64url');
    const expiresAt = new Date(this.now().getTime() + INVITE_TTL_MS);
    await this.tx(async (client) => {
      await client.query(
        'update class_invites set revoked_at = now() where class_id = $1 and revoked_at is null',
        [classId]
      );
      await client.query(
        `insert into class_invites (token_hash, class_id, created_by, expires_at)
         values ($1, $2, $3, $4)`,
        [hashToken(token), classId, actor.id, expiresAt]
      );
      await writeAudit(client, {
        actorId: actor.id,
        action: 'class.invite_created',
        targetType: 'class',
        targetId: classId,
        details: { expiresAt: expiresAt.toISOString() },
        ipAddress: actor.ip,
      });
    });
    return { token, expiresAt: expiresAt.toISOString() };
  }

  async members(classId: string): Promise<Member[]> {
    const { rows } = await this.pool.query<{
      user_id: string;
      email: string | null;
      name: string | null;
      class_role: ClassRole;
      status: MemberStatus;
      joined_at: Date;
    }>(
      `select m.user_id, u.email, u.name, m.class_role, m.status, m.joined_at
         from class_members m join users u on u.id = m.user_id
        where m.class_id = $1
        order by m.status desc, m.class_role desc, u.email`,
      [classId]
    );
    return rows.map((r) => ({
      userId: r.user_id,
      email: r.email,
      name: r.name || null,
      classRole: r.class_role,
      status: r.status,
      joinedAt: r.joined_at.toISOString(),
    }));
  }

  async approve(actor: Actor, classId: string, userId: string): Promise<boolean> {
    return this.tx(async (client) => {
      const { rowCount } = await client.query(
        `update class_members set status = 'active', approved_at = now()
          where class_id = $1 and user_id = $2 and status = 'pending'`,
        [classId, userId]
      );
      if (!rowCount) return false;
      await writeAudit(client, {
        actorId: actor.id,
        action: 'class.member_approved',
        targetType: 'class',
        targetId: classId,
        details: { userId },
        ipAddress: actor.ip,
      });
      return true;
    });
  }

  async remove(actor: Actor, classId: string, userId: string): Promise<boolean> {
    return this.tx(async (client) => {
      // Teachers are not removed here: a class always keeps the teacher who runs it.
      const { rows } = await client.query<{ status: MemberStatus }>(
        `delete from class_members
          where class_id = $1 and user_id = $2 and class_role = 'student'
        returning status`,
        [classId, userId]
      );
      if (!rows[0]) return false;
      await writeAudit(client, {
        actorId: actor.id,
        action:
          rows[0].status === 'pending' ? 'class.member_rejected' : 'class.member_removed',
        targetType: 'class',
        targetId: classId,
        details: { userId },
        ipAddress: actor.ip,
      });
      return true;
    });
  }

  async preview(token: string): Promise<InvitePreview | null> {
    const { rows } = await this.pool.query<{
      class_id: string;
      name: string;
      teacher_name: string | null;
    }>(
      `select c.id as class_id, c.name,
              (select coalesce(nullif(u.name, ''), split_part(u.email, '@', 1))
                 from users u where u.id = c.created_by) as teacher_name
         from class_invites i join classes c on c.id = i.class_id
        where i.token_hash = $1 and i.revoked_at is null and i.expires_at > $2
          and c.archived_at is null`,
      [hashToken(token), this.now()]
    );
    const r = rows[0];
    return r
      ? { classId: r.class_id, className: r.name, teacherName: r.teacher_name }
      : null;
  }

  async join(actor: Actor, token: string): Promise<JoinResult> {
    const invite = await this.preview(token);
    if (!invite) return { ok: false, reason: 'invalid_invite' };
    return this.tx(async (client) => {
      // Joining twice is harmless: an existing membership (or teacher role) stays as it is.
      const { rows } = await client.query<{ status: MemberStatus; inserted: boolean }>(
        `insert into class_members (class_id, user_id, class_role, status)
         values ($1, $2, 'student', 'pending')
         on conflict (class_id, user_id) do update set class_id = excluded.class_id
         returning status, (xmax = 0) as inserted`,
        [invite.classId, actor.id]
      );
      const row = rows[0]!;
      if (row.inserted) {
        await writeAudit(client, {
          actorId: actor.id,
          action: 'class.join_requested',
          targetType: 'class',
          targetId: invite.classId,
          ipAddress: actor.ip,
        });
      }
      return {
        ok: true,
        classId: invite.classId,
        className: invite.className,
        status: row.status,
      };
    });
  }
}
