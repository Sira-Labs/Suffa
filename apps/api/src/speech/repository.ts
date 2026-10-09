/**
 * Whether a learner's recordings may go to the server's speech recogniser (story 15.2).
 * Each class decides for its learners (`classes.server_speech`); unset means on, except in
 * classes of minors. A learner in several classes needs all of them to allow it.
 */
import type pg from 'pg';

export interface SpeechRepository {
  /** The learner may use server pronunciation feedback (true without any class). */
  allowedFor(userId: string): Promise<boolean>;
  /** The class's effective setting. */
  classSetting(classId: string): Promise<boolean>;
  setClassSetting(classId: string, allowed: boolean): Promise<void>;
}

export class PgSpeechRepository implements SpeechRepository {
  constructor(private readonly pool: pg.Pool) {}

  async allowedFor(userId: string): Promise<boolean> {
    const { rows } = await this.pool.query<{ allowed: boolean | null }>(
      `select bool_and(coalesce(c.server_speech, not c.minors)) as allowed
         from class_members m join classes c on c.id = m.class_id
        where m.user_id = $1 and m.status = 'active' and c.archived_at is null`,
      [userId]
    );
    return rows[0]?.allowed ?? true;
  }

  async classSetting(classId: string): Promise<boolean> {
    const { rows } = await this.pool.query<{ allowed: boolean }>(
      'select coalesce(server_speech, not minors) as allowed from classes where id = $1',
      [classId]
    );
    return rows[0]?.allowed ?? false;
  }

  async setClassSetting(classId: string, allowed: boolean): Promise<void> {
    await this.pool.query('update classes set server_speech = $2 where id = $1', [
      classId,
      allowed,
    ]);
  }
}
