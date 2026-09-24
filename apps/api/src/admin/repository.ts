/**
 * Users in the admin area (story 4.2): list with keyset pagination (newest first, served by
 * users_created_idx), change role, disable/enable. Every change and its audit entry commit in
 * one transaction; disabling ends all of the user's sessions at once.
 */
import type pg from 'pg';
import { listAudit, writeAudit, type AuditRecord } from '../audit/log.js';
import type { Role } from '../authz/policies.js';

export interface AdminUser {
  id: string;
  email: string | null;
  name: string | null;
  role: Role;
  emailVerified: boolean;
  disabled: boolean;
  createdAt: string;
}

export interface UserChange {
  role?: Role;
  disabled?: boolean;
}

/** Who made a change and from where (for the audit log). */
export interface ChangeContext {
  actorId: string;
  ipAddress: string | null;
}

/** Position after the last row of a page. */
export interface UserCursor {
  createdAt: string;
  id: string;
}

export interface UserQuery {
  /** Part of the email address or name, case-insensitive. */
  search: string | null;
  after: UserCursor | null;
  limit: number;
}

export interface UserPage {
  users: AdminUser[];
  next: UserCursor | null;
}

export interface AdminRepository {
  listUsers(query: UserQuery): Promise<UserPage>;
  /** Applies a change and audits it; null when the user does not exist. */
  updateUser(
    id: string,
    change: UserChange,
    context: ChangeContext
  ): Promise<AdminUser | null>;
  listAudit(query: {
    beforeId: string | null;
    limit: number;
  }): Promise<{ entries: AuditRecord[]; next: string | null }>;
}

type UserRow = {
  id: string;
  email: string | null;
  name: string | null;
  role: Role;
  email_verified: boolean;
  disabled_at: Date | null;
  created_at: Date;
};

const USER_COLUMNS = 'id, email, name, role, email_verified, disabled_at, created_at';

function toAdminUser(r: UserRow): AdminUser {
  return {
    id: r.id,
    email: r.email,
    name: r.name || null,
    role: r.role,
    emailVerified: r.email_verified,
    disabled: r.disabled_at !== null,
    createdAt: r.created_at.toISOString(),
  };
}

/** Escapes LIKE wildcards so a search for "a_b" or "100%" matches literally. */
export function likePattern(search: string): string {
  return `%${search.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

export class PgAdminRepository implements AdminRepository {
  constructor(private readonly pool: pg.Pool) {}

  async listUsers({ search, after, limit }: UserQuery): Promise<UserPage> {
    const { rows } = await this.pool.query<UserRow>(
      `select ${USER_COLUMNS}
         from users
        where ($1::text is null or email ilike $1 escape '\\' or name ilike $1 escape '\\')
          and ($2::timestamptz is null or (created_at, id) < ($2::timestamptz, $3::uuid))
        order by created_at desc, id desc
        limit $4`,
      [
        search ? likePattern(search) : null,
        after?.createdAt ?? null,
        after?.id ?? null,
        limit + 1,
      ]
    );
    const page = rows.slice(0, limit).map(toAdminUser);
    const last = page.at(-1);
    return {
      users: page,
      next:
        rows.length > limit && last ? { createdAt: last.createdAt, id: last.id } : null,
    };
  }

  async updateUser(
    id: string,
    change: UserChange,
    context: ChangeContext
  ): Promise<AdminUser | null> {
    const client = await this.pool.connect();
    try {
      await client.query('begin');
      const { rows } = await client.query<UserRow>(
        `select ${USER_COLUMNS} from users where id = $1 for update`,
        [id]
      );
      const before = rows[0];
      if (!before) {
        await client.query('rollback');
        return null;
      }
      const audit = (action: string, details: Record<string, unknown>) =>
        writeAudit(client, {
          actorId: context.actorId,
          action,
          targetType: 'user',
          targetId: id,
          details,
          ipAddress: context.ipAddress,
        });
      if (change.role !== undefined && change.role !== before.role) {
        await client.query(
          'update users set role = $2, updated_at = now() where id = $1',
          [id, change.role]
        );
        await audit('user.role_changed', { from: before.role, to: change.role });
      }
      const wasDisabled = before.disabled_at !== null;
      if (change.disabled !== undefined && change.disabled !== wasDisabled) {
        await client.query(
          `update users set disabled_at = ${change.disabled ? 'now()' : 'null'},
                  updated_at = now() where id = $1`,
          [id]
        );
        let endedSessions = 0;
        if (change.disabled) {
          const ended = await client.query('delete from sessions where user_id = $1', [
            id,
          ]);
          endedSessions = ended.rowCount ?? 0;
        }
        await audit(change.disabled ? 'user.disabled' : 'user.enabled', {
          ...(change.disabled ? { endedSessions } : {}),
        });
      }
      const { rows: after } = await client.query<UserRow>(
        `select ${USER_COLUMNS} from users where id = $1`,
        [id]
      );
      await client.query('commit');
      return toAdminUser(after[0]!);
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
  }

  listAudit(query: { beforeId: string | null; limit: number }) {
    return listAudit(this.pool, query);
  }
}
