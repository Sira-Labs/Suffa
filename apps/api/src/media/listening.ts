/**
 * Who listened to a class's recordings, for its teachers: per published recording, how many
 * learners started it and finished it, and each learner's share heard. Built from the
 * learners' own synced progress (`media_progress`, id `rec/<mediaId>`); the class's active
 * learners are counted, whether they opened the recording or not.
 */
import type pg from 'pg';

export interface LearnerListening {
  userId: string;
  name: string;
  /** Share of the recording heard, 0–100. */
  percent: number;
  /** When the learner finished it (85 % heard); null while not finished. */
  completedAt: string | null;
}

export interface RecordingListening {
  mediaId: string;
  /** Active learners of the class. */
  learners: number;
  started: number;
  finished: number;
  /** Every active learner, finished first, then by share heard. */
  people: LearnerListening[];
}

export interface ListeningRepository {
  forClass(classId: string): Promise<RecordingListening[]>;
}

export class PgListeningRepository implements ListeningRepository {
  constructor(private readonly pool: pg.Pool) {}

  async forClass(classId: string): Promise<RecordingListening[]> {
    const { rows } = await this.pool.query(
      `with learners as (
         select m.user_id, coalesce(nullif(u.name, ''), u.email, 'Ohne Namen') as name
           from class_members m join users u on u.id = m.user_id
          where m.class_id = $1 and m.status = 'active' and m.class_role = 'student'
       ),
       recordings as (
         select id, coalesce(duration_sec, 0) as duration_sec from media_items
          where class_id = $1 and status = 'ready' and published_at is not null
       )
       select r.id as media_id, l.user_id, l.name,
              coalesce(p."listenedSec", 0) as listened,
              greatest(coalesce(p."durationSec", 0), r.duration_sec) as duration,
              p."completedAt" as completed_at
         from recordings r
         cross join learners l
         left join media_progress p
           on p.user_id = l.user_id and p.id = 'rec/' || r.id and not p.deleted`,
      [classId]
    );
    const byRecording = new Map<string, RecordingListening>();
    for (const row of rows) {
      const mediaId = row.media_id as string;
      let entry = byRecording.get(mediaId);
      if (!entry) {
        entry = { mediaId, learners: 0, started: 0, finished: 0, people: [] };
        byRecording.set(mediaId, entry);
      }
      const listened = Number(row.listened);
      const duration = Number(row.duration);
      const completedAt = (row.completed_at as Date | null)?.toISOString() ?? null;
      const percent = completedAt
        ? 100
        : duration > 0
          ? Math.min(99, Math.round((listened / duration) * 100))
          : 0;
      entry.learners += 1;
      if (listened > 0 || completedAt) entry.started += 1;
      if (completedAt) entry.finished += 1;
      entry.people.push({
        userId: row.user_id as string,
        name: row.name as string,
        percent,
        completedAt,
      });
    }
    for (const entry of byRecording.values()) {
      entry.people.sort(
        (a, b) => b.percent - a.percent || a.name.localeCompare(b.name, 'de')
      );
    }
    return [...byRecording.values()];
  }
}
