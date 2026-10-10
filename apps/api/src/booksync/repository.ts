/**
 * Book sync per lesson (see schema.ts). One row per course, book and lesson; every save names
 * the revision it started from (0 for a lesson without one yet), so two admins never overwrite
 * each other, and is audit-logged in the same transaction.
 */
import type pg from 'pg';
import { writeAudit } from '../audit/log.js';
import { inTransaction } from '../db/transaction.js';
import type { BookSyncData } from './schema.js';

export interface LessonSync extends BookSyncData {
  lesson: number;
  revision: number;
  updatedAt: string;
}

export interface SyncActor {
  id: string;
  ipAddress: string | null;
}

export type SyncSaveResult =
  | { ok: true; revision: number }
  | { ok: false; reason: 'stale_revision' };

export interface BookSyncRepository {
  list(course: string, book: number): Promise<LessonSync[]>;
  save(
    course: string,
    book: number,
    lesson: number,
    actor: SyncActor,
    revision: number,
    data: BookSyncData
  ): Promise<SyncSaveResult>;
}

export class PgBookSyncRepository implements BookSyncRepository {
  constructor(private readonly pool: pg.Pool) {}

  async list(course: string, book: number): Promise<LessonSync[]> {
    const { rows } = await this.pool.query<{
      lesson: number;
      data: BookSyncData;
      revision: number;
      updated_at: Date;
    }>(
      `select lesson, data, revision, updated_at
         from book_sync where course = $1 and book = $2 order by lesson`,
      [course, book]
    );
    return rows.map((r) => ({
      lesson: r.lesson,
      revision: r.revision,
      updatedAt: r.updated_at.toISOString(),
      pages: r.data.pages ?? [],
      lines: r.data.lines ?? [],
    }));
  }

  async save(
    course: string,
    book: number,
    lesson: number,
    actor: SyncActor,
    revision: number,
    data: BookSyncData
  ): Promise<SyncSaveResult> {
    return inTransaction(this.pool, async (client) => {
      const { rows } = await client.query<{ revision: number }>(
        `select revision from book_sync
          where course = $1 and book = $2 and lesson = $3 for update`,
        [course, book, lesson]
      );
      const current = rows[0]?.revision ?? 0;
      if (current !== revision) return { ok: false, reason: 'stale_revision' };
      const next = current + 1;
      if (current === 0) {
        // Two first saves at once: the second insert conflicts and is refused as stale.
        const inserted = await client.query(
          `insert into book_sync (course, book, lesson, data, revision, updated_by)
           values ($1, $2, $3, $4::jsonb, 1, $5)
           on conflict (course, book, lesson) do nothing`,
          [course, book, lesson, JSON.stringify(data), actor.id]
        );
        if (inserted.rowCount === 0) return { ok: false, reason: 'stale_revision' };
      } else {
        await client.query(
          `update book_sync set data = $4::jsonb, revision = $5, updated_by = $6,
                  updated_at = now()
            where course = $1 and book = $2 and lesson = $3`,
          [course, book, lesson, JSON.stringify(data), next, actor.id]
        );
      }
      await writeAudit(client, {
        actorId: actor.id,
        action: 'content.book_sync_saved',
        targetType: 'book_sync',
        targetId: `${course}/${book}/${lesson}`,
        ipAddress: actor.ipAddress,
        details: { revision: next, pages: data.pages.length, lines: data.lines.length },
      });
      return { ok: true, revision: next };
    });
  }
}
