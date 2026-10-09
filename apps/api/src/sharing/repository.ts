/**
 * Recordings learners share with their class teachers (story 15.4). Opt-in per recording;
 * only the teachers of that class hear it; the learner withdraws it at any time. Rows that
 * disappear (withdrawn, account deleted, removed from the class, consent revoked) queue their
 * file in `object_deletions` by trigger; `purgeDeletedFiles` removes it from the store.
 */
import type pg from 'pg';
import { writeAudit } from '../audit/log.js';
import type { SqlPool } from '../migrate.js';
import type { BucketRole, ObjectStorage } from '../storage/objectStorage.js';

export interface ShareTarget {
  classId: string;
  name: string;
  /** False in a class of minors until the teacher recorded the parents' consent. */
  allowed: boolean;
}

export interface SharedRecording {
  id: string;
  classId: string;
  className: string;
  objectKey: string;
  contentType: string;
  text: string;
  score: number | null;
  comment: string | null;
  commentedAt: string | null;
  heardAt: string | null;
  createdAt: string;
}

export interface ClassSharedRecording extends SharedRecording {
  learner: { id: string; name: string | null; email: string | null };
}

export interface NewSharedRecording {
  id: string;
  userId: string;
  classId: string;
  objectKey: string;
  contentType: string;
  sizeBytes: number;
  text: string;
  score: number | null;
}

export type ShareCheck = 'ok' | 'not_member' | 'consent_needed' | 'too_many';

/** A learner keeps at most this many shared recordings per class. */
export const MAX_SHARED_PER_CLASS = 50;

export interface SharingRepository {
  /** Classes the learner is an active student of, and whether sharing is allowed there. */
  targets(userId: string): Promise<ShareTarget[]>;
  check(userId: string, classId: string): Promise<ShareCheck>;
  add(recording: NewSharedRecording): Promise<void>;
  /** The learner's own shared recordings, newest first. */
  mine(userId: string): Promise<SharedRecording[]>;
  /** Removes one of the learner's recordings; false if it is not theirs. */
  withdraw(userId: string, id: string): Promise<boolean>;
  /** What the class's learners shared (only those allowed to share), newest first. */
  forClass(classId: string): Promise<ClassSharedRecording[]>;
  /** The teacher's comment and "heard" mark; false if the recording is not in the class. */
  review(
    classId: string,
    id: string,
    change: { comment?: string | null; heard?: boolean }
  ): Promise<boolean>;
  /**
   * Records or revokes the parents' consent for a student of the class (audit-logged).
   * Revoking removes what the learner shared. False if they are not a student there.
   */
  setConsent(
    actor: { id: string; ip?: string | null },
    classId: string,
    userId: string,
    consent: boolean
  ): Promise<boolean>;
}

type Row = {
  id: string;
  class_id: string;
  class_name: string;
  object_key: string;
  content_type: string;
  text: string;
  score: number | null;
  comment: string | null;
  commented_at: Date | null;
  heard_at: Date | null;
  created_at: Date;
};

const toRecording = (r: Row): SharedRecording => ({
  id: r.id,
  classId: r.class_id,
  className: r.class_name,
  objectKey: r.object_key,
  contentType: r.content_type,
  text: r.text,
  score: r.score,
  comment: r.comment,
  commentedAt: r.commented_at?.toISOString() ?? null,
  heardAt: r.heard_at?.toISOString() ?? null,
  createdAt: r.created_at.toISOString(),
});

const COLUMNS = `r.id, r.class_id, c.name as class_name, r.object_key, r.content_type, r.text,
  r.score, r.comment, r.commented_at, r.heard_at, r.created_at`;

/** Sharing is allowed for an active student of a live class, with consent if minors. */
const ALLOWED = `m.class_role = 'student' and m.status = 'active' and c.archived_at is null
  and (not c.minors or m.parental_consent_at is not null)`;

export class PgSharingRepository implements SharingRepository {
  constructor(private readonly pool: pg.Pool) {}

  async targets(userId: string): Promise<ShareTarget[]> {
    const { rows } = await this.pool.query<{
      id: string;
      name: string;
      allowed: boolean;
    }>(
      `select c.id, c.name, (not c.minors or m.parental_consent_at is not null) as allowed
         from class_members m join classes c on c.id = m.class_id
        where m.user_id = $1 and m.class_role = 'student' and m.status = 'active'
          and c.archived_at is null
        order by c.name`,
      [userId]
    );
    return rows.map((r) => ({ classId: r.id, name: r.name, allowed: r.allowed }));
  }

  async check(userId: string, classId: string): Promise<ShareCheck> {
    const { rows } = await this.pool.query<{
      minors: boolean;
      consent: boolean;
      n: number;
    }>(
      `select c.minors, m.parental_consent_at is not null as consent,
              (select count(*)::int from shared_recordings r
                where r.user_id = m.user_id and r.class_id = m.class_id) as n
         from class_members m join classes c on c.id = m.class_id
        where m.user_id = $1 and m.class_id = $2 and m.class_role = 'student'
          and m.status = 'active' and c.archived_at is null`,
      [userId, classId]
    );
    const row = rows[0];
    if (!row) return 'not_member';
    if (row.minors && !row.consent) return 'consent_needed';
    if (row.n >= MAX_SHARED_PER_CLASS) return 'too_many';
    return 'ok';
  }

  async add(r: NewSharedRecording): Promise<void> {
    await this.pool.query(
      `insert into shared_recordings
         (id, user_id, class_id, object_key, content_type, size_bytes, text, score)
       values ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        r.id,
        r.userId,
        r.classId,
        r.objectKey,
        r.contentType,
        r.sizeBytes,
        r.text,
        r.score,
      ]
    );
  }

  async mine(userId: string): Promise<SharedRecording[]> {
    const { rows } = await this.pool.query<Row>(
      `select ${COLUMNS}
         from shared_recordings r join classes c on c.id = r.class_id
        where r.user_id = $1
        order by r.created_at desc
        limit 200`,
      [userId]
    );
    return rows.map(toRecording);
  }

  async withdraw(userId: string, id: string): Promise<boolean> {
    const { rowCount } = await this.pool.query(
      'delete from shared_recordings where id = $1 and user_id = $2',
      [id, userId]
    );
    return rowCount === 1;
  }

  async forClass(classId: string): Promise<ClassSharedRecording[]> {
    const { rows } = await this.pool.query<
      Row & { user_id: string; user_name: string | null; email: string | null }
    >(
      `select ${COLUMNS}, r.user_id, u.name as user_name, u.email
         from shared_recordings r
         join classes c on c.id = r.class_id
         join class_members m on m.class_id = r.class_id and m.user_id = r.user_id
         join users u on u.id = r.user_id
        where r.class_id = $1 and ${ALLOWED}
        order by r.created_at desc
        limit 200`,
      [classId]
    );
    return rows.map((r) => ({
      ...toRecording(r),
      learner: { id: r.user_id, name: r.user_name || null, email: r.email },
    }));
  }

  async review(
    classId: string,
    id: string,
    change: { comment?: string | null; heard?: boolean }
  ): Promise<boolean> {
    const { rowCount } = await this.pool.query(
      `update shared_recordings set
         comment = case when $3 then $4 else comment end,
         commented_at = case when $3 then (case when $4::text is null then null else now() end)
                             else commented_at end,
         heard_at = case when $5::boolean is null then heard_at
                         when $5 then coalesce(heard_at, now()) else null end
       where id = $1 and class_id = $2`,
      [
        id,
        classId,
        change.comment !== undefined,
        change.comment ?? null,
        change.heard ?? null,
      ]
    );
    return rowCount === 1;
  }

  async setConsent(
    actor: { id: string; ip?: string | null },
    classId: string,
    userId: string,
    consent: boolean
  ): Promise<boolean> {
    const client = await this.pool.connect();
    try {
      await client.query('begin');
      const { rowCount } = await client.query(
        `update class_members
            set parental_consent_at = case when $3 then coalesce(parental_consent_at, now())
                                           else null end
          where class_id = $1 and user_id = $2 and class_role = 'student'`,
        [classId, userId, consent]
      );
      if (!rowCount) {
        await client.query('rollback');
        return false;
      }
      if (!consent) {
        await client.query(
          'delete from shared_recordings where class_id = $1 and user_id = $2',
          [classId, userId]
        );
      }
      await writeAudit(client, {
        actorId: actor.id,
        action: consent
          ? 'class.parental_consent_recorded'
          : 'class.parental_consent_revoked',
        targetType: 'class',
        targetId: classId,
        details: { userId },
        ipAddress: actor.ip ?? null,
      });
      await client.query('commit');
      return true;
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
  }
}

/**
 * Deletes files queued in `object_deletions` from the store (oldest first, `limit` at a
 * time). A file that cannot be deleted stays queued for the next run. Returns the number
 * deleted.
 */
export async function purgeDeletedFiles(
  pool: SqlPool,
  storage: Pick<ObjectStorage, 'delete'>,
  limit = 100
): Promise<number> {
  const client = await pool.connect();
  try {
    const { rows } = await client.query<{ bucket: BucketRole; object_key: string }>(
      'select bucket, object_key from object_deletions order by queued_at limit $1',
      [limit]
    );
    for (const row of rows) {
      await storage.delete(row.bucket, row.object_key);
      await client.query(
        'delete from object_deletions where bucket = $1 and object_key = $2',
        [row.bucket, row.object_key]
      );
    }
    return rows.length;
  } finally {
    client.release();
  }
}
