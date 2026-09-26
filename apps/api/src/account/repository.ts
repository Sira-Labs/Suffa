/**
 * Persistence for account self-service (story 3.4): the learner's sessions ("devices") and
 * settings. Every query is scoped by the user id the caller got from the session, so one user
 * can never see or end another user's session.
 */
import type pg from 'pg';

/** A session as the account page shows it; the session token never leaves the database. */
export interface DeviceSession {
  id: string;
  createdAt: string;
  lastActiveAt: string;
  expiresAt: string;
  userAgent: string | null;
}

export interface AccountRepository {
  listSessions(userId: string): Promise<DeviceSession[]>;
  /** Ends one session of this user; false when there is no such session. */
  revokeSession(userId: string, sessionId: string): Promise<boolean>;
  /** Ends every session of this user except `keepSessionId`; returns how many ended. */
  revokeOtherSessions(userId: string, keepSessionId: string): Promise<number>;
  setTimeZone(userId: string, timeZone: string | null): Promise<void>;
  /** This user's passkeys, newest first; never the public key. */
  listPasskeys(userId: string): Promise<StoredPasskey[]>;
  /** Removes one passkey of this user; false when there is no such passkey. */
  deletePasskey(userId: string, passkeyId: string): Promise<boolean>;
}

/** A passkey as the settings list it (ADR-0008 update 2026-09-26). */
export interface StoredPasskey {
  id: string;
  name: string | null;
  aaguid: string | null;
  /** Synced across the learner's devices (iCloud Keychain, Google Password Manager). */
  synced: boolean;
  createdAt: string;
}

/** Upper bound for the device list; more live sessions than this means something is off. */
export const MAX_LISTED_SESSIONS = 50;

/** Upper bound for the passkey list. */
export const MAX_LISTED_PASSKEYS = 50;

export class PgAccountRepository implements AccountRepository {
  constructor(private readonly pool: pg.Pool) {}

  async listSessions(userId: string): Promise<DeviceSession[]> {
    const { rows } = await this.pool.query<{
      id: string;
      created_at: Date;
      updated_at: Date;
      expires_at: Date;
      user_agent: string | null;
    }>(
      `select id, created_at, updated_at, expires_at, user_agent
         from sessions
        where user_id = $1 and expires_at > now()
        order by updated_at desc, id
        limit $2`,
      [userId, MAX_LISTED_SESSIONS]
    );
    return rows.map((r) => ({
      id: r.id,
      createdAt: r.created_at.toISOString(),
      lastActiveAt: r.updated_at.toISOString(),
      expiresAt: r.expires_at.toISOString(),
      userAgent: r.user_agent || null,
    }));
  }

  async revokeSession(userId: string, sessionId: string): Promise<boolean> {
    const { rowCount } = await this.pool.query(
      'delete from sessions where user_id = $1 and id = $2',
      [userId, sessionId]
    );
    return (rowCount ?? 0) > 0;
  }

  async revokeOtherSessions(userId: string, keepSessionId: string): Promise<number> {
    const { rowCount } = await this.pool.query(
      'delete from sessions where user_id = $1 and id <> $2',
      [userId, keepSessionId]
    );
    return rowCount ?? 0;
  }

  async setTimeZone(userId: string, timeZone: string | null): Promise<void> {
    await this.pool.query(
      'update users set time_zone = $2, updated_at = now() where id = $1',
      [userId, timeZone]
    );
  }

  async listPasskeys(userId: string): Promise<StoredPasskey[]> {
    const { rows } = await this.pool.query<{
      id: string;
      name: string | null;
      aaguid: string | null;
      backed_up: boolean;
      created_at: Date;
    }>(
      `select id, name, aaguid, backed_up, created_at
         from passkeys
        where user_id = $1
        order by created_at desc, id
        limit $2`,
      [userId, MAX_LISTED_PASSKEYS]
    );
    return rows.map((r) => ({
      id: r.id,
      name: r.name || null,
      aaguid: r.aaguid || null,
      synced: r.backed_up,
      createdAt: r.created_at.toISOString(),
    }));
  }

  async deletePasskey(userId: string, passkeyId: string): Promise<boolean> {
    const { rowCount } = await this.pool.query(
      'delete from passkeys where user_id = $1 and id = $2',
      [userId, passkeyId]
    );
    return (rowCount ?? 0) > 0;
  }
}
