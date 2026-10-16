/**
 * Which live session is being recorded into which recording (ADR-0029). A session records into
 * at most one recording at a time: `live_sessions.recording_media_id` points at it while the
 * egress runs. Starting and stopping are audit-logged in the same transaction.
 */
import type pg from 'pg';
import { writeAudit } from '../audit/log.js';
import { inTransaction } from '../db/transaction.js';
import { OVERRUN_MINUTES, type LiveActor, type LiveSession } from './repository.js';

export interface LiveRecordingRepository {
  /**
   * Claims the live session for a new recording, created as `mediaId` (status `recording`);
   * false when the session is not live or already being recorded.
   */
  begin(
    session: LiveSession,
    recording: { mediaId: string; createdBy: string; title: string; key: string },
    actor: LiveActor
  ): Promise<boolean>;
  /** The egress that writes the recording. */
  attach(mediaId: string, egressId: string): Promise<void>;
  /** The recording running in a session, if any. */
  current(sessionId: string): Promise<string | null>;
  /**
   * The session no longer points at the recording (stopped, finished or failed); audit-logged
   * when an actor stopped it.
   */
  release(mediaId: string, actor?: LiveActor): Promise<void>;
  /** Removes a recording that never started (the egress refused it). */
  discard(mediaId: string): Promise<void>;
  /** The recording's session is still live (not ended, not left far past its planned end). */
  sessionLive(mediaId: string, now: Date): Promise<boolean>;
}

export class PgLiveRecordingRepository implements LiveRecordingRepository {
  constructor(private readonly pool: pg.Pool) {}

  async begin(
    session: LiveSession,
    recording: { mediaId: string; createdBy: string; title: string; key: string },
    actor: LiveActor
  ): Promise<boolean> {
    return inTransaction(this.pool, async (db) => {
      await db.query(
        `insert into media_items (id, class_id, created_by, title, source, status, original_key,
                                  original_name, original_size, content_type)
         values ($1, $2, $3, $4, 'live', 'recording', $5, null, 0, 'video/mp4')`,
        [
          recording.mediaId,
          session.classId,
          recording.createdBy,
          recording.title,
          recording.key,
        ]
      );
      const claimed = await db.query(
        `update live_sessions set recording_media_id = $2
          where id = $1 and status = 'live' and recording_media_id is null`,
        [session.id, recording.mediaId]
      );
      if (claimed.rowCount !== 1) {
        await db.query('delete from media_items where id = $1', [recording.mediaId]);
        return false;
      }
      await writeAudit(db, {
        actorId: actor.id,
        action: 'live.recording_started',
        targetType: 'live_session',
        targetId: session.id,
        ipAddress: actor.ip,
        details: { classId: session.classId, mediaId: recording.mediaId },
      });
      return true;
    });
  }

  async attach(mediaId: string, egressId: string): Promise<void> {
    await this.pool.query(
      'update media_items set egress_id = $2, updated_at = now() where id = $1',
      [mediaId, egressId]
    );
  }

  async current(sessionId: string): Promise<string | null> {
    const { rows } = await this.pool.query<{ recording_media_id: string | null }>(
      'select recording_media_id from live_sessions where id = $1',
      [sessionId]
    );
    return rows[0]?.recording_media_id ?? null;
  }

  async release(mediaId: string, actor?: LiveActor): Promise<void> {
    await inTransaction(this.pool, async (db) => {
      const { rows } = await db.query<{ id: string; class_id: string }>(
        `update live_sessions set recording_media_id = null
          where recording_media_id = $1 returning id, class_id`,
        [mediaId]
      );
      const session = rows[0];
      if (!session || !actor) return;
      await writeAudit(db, {
        actorId: actor.id,
        action: 'live.recording_stopped',
        targetType: 'live_session',
        targetId: session.id,
        ipAddress: actor.ip,
        details: { classId: session.class_id, mediaId },
      });
    });
  }

  async discard(mediaId: string): Promise<void> {
    await this.release(mediaId);
    await this.pool.query(
      `delete from media_items where id = $1 and status = 'recording'`,
      [mediaId]
    );
  }

  async sessionLive(mediaId: string, now: Date): Promise<boolean> {
    const { rows } = await this.pool.query(
      `select 1 from live_sessions
        where recording_media_id = $1 and status = 'live'
          and started_at + make_interval(mins => duration_minutes + $3) >= $2`,
      [mediaId, now, OVERRUN_MINUTES]
    );
    return rows.length > 0;
  }
}
