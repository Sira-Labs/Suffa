/**
 * How long a live room may exist (ADR-0026, update 2026-11-16). A room belongs to a session
 * that is live: once the session has ended, by the teacher or by running far past its
 * length, nobody should be left in its room and nothing should bring it back.
 *
 * Two things work against that. The API ends an overrun session lazily, when someone next
 * looks at the class, without closing its room. And LiveKit creates a room for any valid
 * token and keeps handing the people in it fresh tokens, so the lifetime of the token the API
 * signed is only the first bound.
 *
 * So the worker sweeps every five minutes:
 * - sessions left live past their length plus the overrun are ended, also when nobody looks;
 * - it asks LiveKit which rooms exist and closes every room of ours whose session is not
 *   live. That covers a room that stayed open, one a late token brought back, and one a
 *   failed sweep left behind, with no time window to fall out of.
 */
import type pg from 'pg';
import { OVERRUN_MINUTES } from './repository.js';
import type { LiveRooms } from './rooms.js';

/** A token is never shorter than this, so a join at the last minute still connects. */
export const MIN_TOKEN_SECONDS = 120;

/** The moment a session that started at `startedAt` is over at the latest. */
export function latestEnd(startedAt: Date, durationMinutes: number): Date {
  return new Date(startedAt.getTime() + (durationMinutes + OVERRUN_MINUTES) * 60_000);
}

/**
 * How long a join token for a live session is valid: until the session is over at the
 * latest, whenever someone joins. (Before, every token lasted the whole length plus the
 * overrun from the moment of joining, up to five hours past the lesson.)
 */
export function tokenSeconds(
  startedAt: Date,
  durationMinutes: number,
  now: Date
): number {
  const end = latestEnd(startedAt, durationMinutes).getTime();
  return Math.max(MIN_TOKEN_SECONDS, Math.ceil((end - now.getTime()) / 1000));
}

const ROOM_PREFIX = 'live-';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The LiveKit room of a session. */
export const roomName = (sessionId: string) => `${ROOM_PREFIX}${sessionId}`;

/** The session a room belongs to; null for a room that is not one of ours. */
export function sessionOfRoom(room: string): string | null {
  if (!room.startsWith(ROOM_PREFIX)) return null;
  const id = room.slice(ROOM_PREFIX.length);
  return UUID.test(id) ? id : null;
}

export interface LiveRoomSweepRepository {
  /** Ends every session left live past its length plus the overrun; how many. */
  endOverrun(now: Date): Promise<number>;
  /** Which of these sessions are live. */
  liveAmong(sessionIds: string[]): Promise<Set<string>>;
}

export class PgLiveRoomSweepRepository implements LiveRoomSweepRepository {
  constructor(private readonly pool: pg.Pool) {}

  async endOverrun(now: Date): Promise<number> {
    const { rowCount } = await this.pool.query(
      `update live_sessions
          set status = 'ended', ended_at = $1
        where status = 'live'
          and started_at + make_interval(mins => duration_minutes + $2) < $1`,
      [now, OVERRUN_MINUTES]
    );
    return rowCount ?? 0;
  }

  async liveAmong(sessionIds: string[]): Promise<Set<string>> {
    if (sessionIds.length === 0) return new Set();
    const { rows } = await this.pool.query<{ id: string }>(
      `select id from live_sessions where id = any($1::uuid[]) and status = 'live'`,
      [sessionIds]
    );
    return new Set(rows.map((r) => r.id));
  }
}

export interface LiveRoomSweepResult {
  /** Sessions ended because they ran far past their length. */
  ended: number;
  /** Rooms closed because their session is not live. */
  closed: number;
}

/** Rooms that could not be closed in a sweep; thrown once the others were tried. */
export class LiveRoomSweepError extends AggregateError {
  constructor(
    errors: unknown[],
    readonly result: LiveRoomSweepResult
  ) {
    super(errors, `live room sweep: ${errors.length} rooms could not be closed`);
    this.name = 'LiveRoomSweepError';
  }
}

export interface LiveRoomSweep {
  run(now?: Date): Promise<LiveRoomSweepResult>;
}

export function liveRoomSweep(
  repo: LiveRoomSweepRepository,
  rooms: Pick<LiveRooms, 'list' | 'close'>
): LiveRoomSweep {
  return {
    async run(now = new Date()) {
      const ended = await repo.endOverrun(now);
      // Only rooms named after a session are ours; a session is live before anyone can
      // join, so a room that exists for a session that is not live is always left over.
      const ours = (await rooms.list()).flatMap((room) => {
        const session = sessionOfRoom(room);
        return session ? [{ room, session }] : [];
      });
      const live = await repo.liveAmong(ours.map((r) => r.session));
      const result = { ended, closed: 0 };
      const failures: unknown[] = [];
      for (const { room, session } of ours) {
        if (live.has(session.toLowerCase())) continue;
        try {
          await rooms.close(room);
          result.closed++;
        } catch (error) {
          // One room that cannot be closed must not keep the others open; the job fails
          // afterwards so the error is reported, and the next sweep tries again.
          failures.push(error);
        }
      }
      if (failures.length > 0) throw new LiveRoomSweepError(failures, result);
      return result;
    },
  };
}
