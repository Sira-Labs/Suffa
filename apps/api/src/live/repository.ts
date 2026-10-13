/**
 * Live sessions of a class (ADR-0026): planned, started, ended or cancelled by the class
 * teacher. Every change is audit-logged in the same transaction. A session left live ends on
 * its own once it is more than OVERRUN_MINUTES past its planned length.
 */
import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { writeAudit } from '../audit/log.js';
import { inTransaction } from '../db/transaction.js';

export type LiveStatus = 'scheduled' | 'live' | 'ended';

export interface LiveSession {
  id: string;
  classId: string;
  title: string;
  startsAt: string;
  durationMinutes: number;
  status: LiveStatus;
  startedAt: string | null;
  endedAt: string | null;
}

export interface LiveActor {
  id: string;
  ip: string | null;
}

export interface NewLiveSession {
  title: string;
  startsAt: Date;
  durationMinutes: number;
}

export type LiveActionResult =
  | { ok: true; session: LiveSession }
  | { ok: false; reason: 'not_found' | 'wrong_state' | 'already_live' };

export interface LiveSessionRepository {
  /** The class's sessions still to come or running, soonest first. */
  list(classId: string): Promise<LiveSession[]>;
  get(classId: string, sessionId: string): Promise<LiveSession | null>;
  create(classId: string, actor: LiveActor, input: NewLiveSession): Promise<LiveSession>;
  start(classId: string, sessionId: string, actor: LiveActor): Promise<LiveActionResult>;
  end(classId: string, sessionId: string, actor: LiveActor): Promise<LiveActionResult>;
  /** Removes a session that has not started. */
  cancel(classId: string, sessionId: string, actor: LiveActor): Promise<LiveActionResult>;
  /** The name shown for a user in the room. */
  displayName(userId: string): Promise<string>;
}

/** How long a session may run past its planned length before it ends on its own. */
export const OVERRUN_MINUTES = 60;
/** How long a planned session that never started stays listed after its planned end. */
export const MISSED_HOURS = 12;

interface Row {
  id: string;
  class_id: string;
  title: string;
  starts_at: Date;
  duration_minutes: number;
  status: LiveStatus;
  started_at: Date | null;
  ended_at: Date | null;
}

const COLUMNS =
  'id, class_id, title, starts_at, duration_minutes, status, started_at, ended_at';

function toSession(row: Row): LiveSession {
  return {
    id: row.id,
    classId: row.class_id,
    title: row.title,
    startsAt: row.starts_at.toISOString(),
    durationMinutes: row.duration_minutes,
    status: row.status,
    startedAt: row.started_at?.toISOString() ?? null,
    endedAt: row.ended_at?.toISOString() ?? null,
  };
}

type Db = pg.Pool | pg.PoolClient;

export class PgLiveSessionRepository implements LiveSessionRepository {
  constructor(
    private readonly pool: pg.Pool,
    private readonly now: () => Date = () => new Date()
  ) {}

  /** Ends sessions of the class that were left live far past their planned length. */
  private async endOverrun(db: Db, classId: string): Promise<void> {
    await db.query(
      `update live_sessions
          set status = 'ended', ended_at = $2
        where class_id = $1 and status = 'live'
          and started_at + make_interval(mins => duration_minutes + $3) < $2`,
      [classId, this.now(), OVERRUN_MINUTES]
    );
  }

  async list(classId: string): Promise<LiveSession[]> {
    await this.endOverrun(this.pool, classId);
    const { rows } = await this.pool.query<Row>(
      `select ${COLUMNS} from live_sessions
        where class_id = $1
          and (status = 'live'
               or (status = 'scheduled'
                   and starts_at + make_interval(mins => duration_minutes, hours => $3) > $2))
        order by status = 'live' desc, starts_at
        limit 20`,
      [classId, this.now(), MISSED_HOURS]
    );
    return rows.map(toSession);
  }

  async get(classId: string, sessionId: string): Promise<LiveSession | null> {
    await this.endOverrun(this.pool, classId);
    const { rows } = await this.pool.query<Row>(
      `select ${COLUMNS} from live_sessions where class_id = $1 and id = $2`,
      [classId, sessionId]
    );
    return rows[0] ? toSession(rows[0]) : null;
  }

  async create(
    classId: string,
    actor: LiveActor,
    input: NewLiveSession
  ): Promise<LiveSession> {
    return inTransaction(this.pool, async (db) => {
      const { rows } = await db.query<Row>(
        `insert into live_sessions
           (id, class_id, title, starts_at, duration_minutes, created_by, created_at)
         values ($1, $2, $3, $4, $5, $6, $7)
         returning ${COLUMNS}`,
        [
          randomUUID(),
          classId,
          input.title,
          input.startsAt,
          input.durationMinutes,
          actor.id,
          this.now(),
        ]
      );
      const session = toSession(rows[0]!);
      await this.audit(db, actor, 'live.session_created', session);
      return session;
    });
  }

  async start(
    classId: string,
    sessionId: string,
    actor: LiveActor
  ): Promise<LiveActionResult> {
    try {
      return await this.transition(classId, sessionId, actor, 'scheduled', {
        status: 'live',
        column: 'started_at',
        action: 'live.session_started',
      });
    } catch (error) {
      // The partial unique index: another session of this class is live.
      if ((error as { code?: string }).code === '23505') {
        return { ok: false, reason: 'already_live' };
      }
      throw error;
    }
  }

  async end(
    classId: string,
    sessionId: string,
    actor: LiveActor
  ): Promise<LiveActionResult> {
    return this.transition(classId, sessionId, actor, 'live', {
      status: 'ended',
      column: 'ended_at',
      action: 'live.session_ended',
    });
  }

  async cancel(
    classId: string,
    sessionId: string,
    actor: LiveActor
  ): Promise<LiveActionResult> {
    return inTransaction(this.pool, async (db) => {
      const { rows } = await db.query<Row>(
        `select ${COLUMNS} from live_sessions where class_id = $1 and id = $2 for update`,
        [classId, sessionId]
      );
      const row = rows[0];
      if (!row) return { ok: false, reason: 'not_found' };
      if (row.status !== 'scheduled') return { ok: false, reason: 'wrong_state' };
      await db.query('delete from live_sessions where id = $1', [sessionId]);
      const session = toSession(row);
      await this.audit(db, actor, 'live.session_cancelled', session);
      return { ok: true, session };
    });
  }

  async displayName(userId: string): Promise<string> {
    const { rows } = await this.pool.query<{ name: string | null }>(
      'select name from users where id = $1',
      [userId]
    );
    return rows[0]?.name?.trim() || 'Suffa';
  }

  private async transition(
    classId: string,
    sessionId: string,
    actor: LiveActor,
    from: LiveStatus,
    to: { status: LiveStatus; column: 'started_at' | 'ended_at'; action: string }
  ): Promise<LiveActionResult> {
    return inTransaction(this.pool, async (db) => {
      await this.endOverrun(db, classId);
      const { rows } = await db.query<Row>(
        `select ${COLUMNS} from live_sessions where class_id = $1 and id = $2 for update`,
        [classId, sessionId]
      );
      const row = rows[0];
      if (!row) return { ok: false, reason: 'not_found' };
      if (row.status !== from) return { ok: false, reason: 'wrong_state' };
      const updated = await db.query<Row>(
        `update live_sessions set status = $2, ${to.column} = $3 where id = $1
         returning ${COLUMNS}`,
        [sessionId, to.status, this.now()]
      );
      const session = toSession(updated.rows[0]!);
      await this.audit(db, actor, to.action, session);
      return { ok: true, session };
    });
  }

  private async audit(
    db: pg.PoolClient,
    actor: LiveActor,
    action: string,
    session: LiveSession
  ): Promise<void> {
    await writeAudit(db, {
      actorId: actor.id,
      action,
      targetType: 'live_session',
      targetId: session.id,
      ipAddress: actor.ip,
      details: {
        classId: session.classId,
        title: session.title,
        startsAt: session.startsAt,
      },
    });
  }
}
