/**
 * Read access to users for the admin area (story 4.2 builds changes and the audit log on it).
 * Keyset pagination, newest first, served by users_created_idx (migration 0004).
 */
import type pg from 'pg';
import type { Role } from '../authz/policies.js';

export interface AdminUser {
  id: string;
  email: string | null;
  name: string | null;
  role: Role;
  emailVerified: boolean;
  createdAt: string;
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
}

/** Escapes LIKE wildcards so a search for "a_b" or "100%" matches literally. */
export function likePattern(search: string): string {
  return `%${search.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

export class PgAdminRepository implements AdminRepository {
  constructor(private readonly pool: pg.Pool) {}

  async listUsers({ search, after, limit }: UserQuery): Promise<UserPage> {
    const { rows } = await this.pool.query<{
      id: string;
      email: string | null;
      name: string | null;
      role: Role;
      email_verified: boolean;
      created_at: Date;
    }>(
      `select id, email, name, role, email_verified, created_at
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
    const page = rows.slice(0, limit).map((r) => ({
      id: r.id,
      email: r.email,
      name: r.name || null,
      role: r.role,
      emailVerified: r.email_verified,
      createdAt: r.created_at.toISOString(),
    }));
    const last = page.at(-1);
    return {
      users: page,
      next:
        rows.length > limit && last ? { createdAt: last.createdAt, id: last.id } : null,
    };
  }
}
