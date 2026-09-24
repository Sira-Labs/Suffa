/**
 * Persistence of synced learning data (ADR-0002, ADR-0007).
 *
 * - Upsert is last-write-wins on the server as well: a row is only replaced by a record
 *   with a strictly newer `updated_at`, so a slow device cannot overwrite newer data.
 * - Pull is keyset-paginated on (updated_at, id): records sharing a timestamp are never
 *   skipped between pages.
 * - `user_id` always comes from the authenticated session, never from the payload.
 */
import type pg from 'pg';
import {
  columnsOf,
  JSON_COLUMNS,
  type SyncRecord,
  type SyncTableName,
} from './schemas.js';

export interface PullCursor {
  /** ISO timestamp: return records with updated_at after it (or equal, when afterId is set). */
  since: string | null;
  /** Tie-breaker for records sharing `since`. */
  afterId: string | null;
  limit: number;
}

export interface PullPage {
  records: SyncRecord[];
  /** Cursor for the next page, or null when this was the last one. */
  next: { since: string; afterId: string } | null;
}

export interface SyncRepository {
  /** Upserts records for one user; returns how many rows were inserted or replaced. */
  upsert(userId: string, table: SyncTableName, records: SyncRecord[]): Promise<number>;
  pull(userId: string, table: SyncTableName, cursor: PullCursor): Promise<PullPage>;
}

/** Minimal query surface of `pg.Pool` (keeps the repository unit-testable). */
export type Queryable = Pick<pg.Pool, 'query'>;

const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

function quote(identifier: string): string {
  // Identifiers come from the schema whitelist; the check guards against future mistakes.
  if (!IDENTIFIER.test(identifier)) throw new Error(`unsafe identifier: ${identifier}`);
  return `"${identifier}"`;
}

/**
 * Keeps the newest version of each id: Postgres rejects an upsert that touches the same row
 * twice, and an outbox can legitimately contain several edits of one record.
 */
export function newestPerId(records: SyncRecord[]): SyncRecord[] {
  const byId = new Map<string, SyncRecord>();
  for (const record of records) {
    const existing = byId.get(record.id);
    // Compare as instants: ISO strings with different offsets do not sort lexically.
    if (!existing || Date.parse(existing.updated_at) < Date.parse(record.updated_at)) {
      byId.set(record.id, record);
    }
  }
  return [...byId.values()];
}

function toWire(row: Record<string, unknown>): SyncRecord {
  const { user_id: _userId, ...rest } = row;
  for (const [key, value] of Object.entries(rest)) {
    if (value instanceof Date) rest[key] = value.toISOString();
  }
  return rest as SyncRecord;
}

/**
 * When an incoming record replaces the stored one. Default: last-write-wins on updated_at.
 * SRS cards: the later actual review wins and updated_at only breaks ties, so a card that a
 * device merely created (fresh updated_at, never reviewed) cannot wipe out learning progress
 * made on another device (same rule as the app's cardPrecedence).
 */
function acceptIncoming(table: SyncTableName, t: string): string {
  const newer = `${t}."updated_at" < excluded."updated_at"`;
  if (table !== 'srs_cards') return newer;
  const reviewed = (source: string) => `coalesce(${source}."lastReviewed", '-infinity')`;
  return `(${reviewed('excluded')} > ${reviewed(t)}
        or (${reviewed('excluded')} = ${reviewed(t)} and ${newer}))`;
}

export class PgSyncRepository implements SyncRepository {
  constructor(private readonly db: Queryable) {}

  async upsert(
    userId: string,
    table: SyncTableName,
    records: SyncRecord[]
  ): Promise<number> {
    records = newestPerId(records);
    if (records.length === 0) return 0;
    const columns = columnsOf(table);
    const insertColumns = ['user_id', ...columns].map(quote).join(', ');
    const values: unknown[] = [];
    const rows = records.map((record) => {
      const placeholders = ['user_id', ...columns].map((column) => {
        const value = column === 'user_id' ? userId : record[column];
        if (JSON_COLUMNS.has(column)) {
          values.push(JSON.stringify(value ?? []));
          return `$${values.length}::jsonb`;
        }
        values.push(value ?? null);
        return `$${values.length}`;
      });
      return `(${placeholders.join(', ')})`;
    });
    const updates = columns
      .filter((column) => column !== 'id')
      .map((column) => `${quote(column)} = excluded.${quote(column)}`)
      .join(', ');
    const t = quote(table);
    const sql = `insert into ${t} (${insertColumns}) values ${rows.join(', ')}
      on conflict ("user_id", "id") do update set ${updates}
      where ${acceptIncoming(table, t)}
      returning "id"`;
    const result = await this.db.query(sql, values);
    return result.rowCount ?? 0;
  }

  async pull(
    userId: string,
    table: SyncTableName,
    cursor: PullCursor
  ): Promise<PullPage> {
    const params: unknown[] = [userId];
    let filter = '';
    if (cursor.since && cursor.afterId) {
      params.push(cursor.since, cursor.afterId);
      filter = `and ("updated_at" > $2 or ("updated_at" = $2 and "id" > $3))`;
    } else if (cursor.since) {
      params.push(cursor.since);
      filter = `and "updated_at" > $2`;
    }
    params.push(cursor.limit + 1);
    const sql = `select * from ${quote(table)} where "user_id" = $1 ${filter}
      order by "updated_at", "id" limit $${params.length}`;
    const { rows } = await this.db.query(sql, params);
    const hasMore = rows.length > cursor.limit;
    const records = rows.slice(0, cursor.limit).map(toWire);
    const last = records[records.length - 1];
    return {
      records,
      next: hasMore && last ? { since: last.updated_at, afterId: last.id } : null,
    };
  }
}
