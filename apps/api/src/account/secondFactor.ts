/**
 * Second factor (TOTP) for the signed-in user (story 4.2, ADR-0009). Admin actions need a
 * session that confirmed it within SECOND_FACTOR_TTL_MS. The secret is sealed at rest, a code
 * works once (last_step), and five wrong codes lock confirmation for fifteen minutes.
 */
import type pg from 'pg';
import { SecretBox } from '../security/secretBox.js';
import { newTotpSecret, otpauthUri, verifyTotp } from '../security/totp.js';

export const MAX_FAILED_CODES = 5;
export const LOCK_MS = 15 * 60 * 1000;

export interface TotpRow {
  secretEnc: string;
  enabledAt: Date | null;
  lastStep: number | null;
  failedCount: number;
  lockedUntil: Date | null;
}

export interface SecondFactorRepository {
  get(userId: string): Promise<TotpRow | null>;
  /** Stores a new pending secret (replaces a pending one; never an enabled one). */
  savePending(userId: string, secretEnc: string): Promise<boolean>;
  /**
   * A good code: remember its step, reset failures, enable if pending, confirm the session.
   * Refuses (accepted: false) a step that is not newer than the last used one – checked under
   * the row lock, so two requests with the same code cannot both pass.
   */
  confirm(
    userId: string,
    sessionId: string,
    step: number
  ): Promise<{ accepted: boolean; newlyEnabled: boolean }>;
  recordFailure(
    userId: string,
    failedCount: number,
    lockedUntil: Date | null
  ): Promise<void>;
}

export type ConfirmResult =
  | { ok: true; newlyEnabled: boolean }
  | { ok: false; reason: 'not_set_up' | 'invalid_code' | 'locked' };

export class SecondFactorService {
  constructor(
    private readonly repo: SecondFactorRepository,
    private readonly box: SecretBox,
    private readonly now: () => number = () => Date.now()
  ) {}

  async status(userId: string): Promise<{ enabled: boolean }> {
    const row = await this.repo.get(userId);
    return { enabled: Boolean(row?.enabledAt) };
  }

  /** A fresh secret for the authenticator app; null when 2FA is already enabled. */
  async setup(
    userId: string,
    account: string
  ): Promise<{ uri: string; secret: string } | null> {
    const secret = newTotpSecret();
    const saved = await this.repo.savePending(userId, this.box.seal(secret));
    return saved ? { uri: otpauthUri(secret, account), secret } : null;
  }

  async confirm(userId: string, sessionId: string, code: string): Promise<ConfirmResult> {
    const row = await this.repo.get(userId);
    if (!row) return { ok: false, reason: 'not_set_up' };
    if (row.lockedUntil && row.lockedUntil.getTime() > this.now()) {
      return { ok: false, reason: 'locked' };
    }
    const step = verifyTotp(this.box.open(row.secretEnc), code.trim(), this.now());
    // A code (time step) that was already used does not count again.
    if (step === null || (row.lastStep !== null && step <= row.lastStep)) {
      const failed = row.failedCount + 1;
      const lock = failed >= MAX_FAILED_CODES ? new Date(this.now() + LOCK_MS) : null;
      await this.repo.recordFailure(userId, lock ? 0 : failed, lock);
      return { ok: false, reason: lock ? 'locked' : 'invalid_code' };
    }
    const { accepted, newlyEnabled } = await this.repo.confirm(userId, sessionId, step);
    if (!accepted) return { ok: false, reason: 'invalid_code' };
    return { ok: true, newlyEnabled };
  }
}

export class PgSecondFactorRepository implements SecondFactorRepository {
  constructor(private readonly pool: pg.Pool) {}

  async get(userId: string): Promise<TotpRow | null> {
    const { rows } = await this.pool.query<{
      secret_enc: string;
      enabled_at: Date | null;
      last_step: string | null;
      failed_count: number;
      locked_until: Date | null;
    }>(
      `select secret_enc, enabled_at, last_step, failed_count, locked_until
         from user_totp where user_id = $1`,
      [userId]
    );
    const r = rows[0];
    return r
      ? {
          secretEnc: r.secret_enc,
          enabledAt: r.enabled_at,
          lastStep: r.last_step === null ? null : Number(r.last_step),
          failedCount: r.failed_count,
          lockedUntil: r.locked_until,
        }
      : null;
  }

  async savePending(userId: string, secretEnc: string): Promise<boolean> {
    const { rowCount } = await this.pool.query(
      `insert into user_totp (user_id, secret_enc) values ($1, $2)
       on conflict (user_id) do update
         set secret_enc = excluded.secret_enc, last_step = null, failed_count = 0,
             locked_until = null, created_at = now()
         where user_totp.enabled_at is null`,
      [userId, secretEnc]
    );
    return (rowCount ?? 0) > 0;
  }

  async confirm(
    userId: string,
    sessionId: string,
    step: number
  ): Promise<{ accepted: boolean; newlyEnabled: boolean }> {
    const client = await this.pool.connect();
    try {
      await client.query('begin');
      const { rows } = await client.query<{
        enabled_at: Date | null;
        last_step: string | null;
      }>('select enabled_at, last_step from user_totp where user_id = $1 for update', [
        userId,
      ]);
      const current = rows[0];
      if (!current || (current.last_step !== null && step <= Number(current.last_step))) {
        await client.query('rollback');
        return { accepted: false, newlyEnabled: false };
      }
      await client.query(
        `update user_totp
            set last_step = $2, failed_count = 0, locked_until = null,
                enabled_at = coalesce(enabled_at, now())
          where user_id = $1`,
        [userId, step]
      );
      await client.query(
        'update sessions set second_factor_at = now() where id = $1 and user_id = $2',
        [sessionId, userId]
      );
      await client.query('commit');
      return { accepted: true, newlyEnabled: current.enabled_at === null };
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
  }

  async recordFailure(userId: string, failedCount: number, lockedUntil: Date | null) {
    await this.pool.query(
      'update user_totp set failed_count = $2, locked_until = $3 where user_id = $1',
      [userId, failedCount, lockedUntil]
    );
  }
}
