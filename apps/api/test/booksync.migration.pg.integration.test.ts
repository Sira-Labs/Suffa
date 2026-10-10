/**
 * Migration 0044 marks only the seed's rows as suggestions: an admin's save stays theirs even
 * when the admin's account was deleted since (updated_by set null).
 * Run with SUFFA_TEST_DATABASE_URL=postgres://… ; skipped otherwise. The database is wiped.
 */
import { join } from 'node:path';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadMigrations, migrate } from '../src/migrate.js';

const url = process.env.SUFFA_TEST_DATABASE_URL;
const quiet = { info: () => undefined, warn: () => undefined, error: () => undefined };
const ADMIN = '00000000-0000-4000-8000-0000000000e1';
const data = JSON.stringify({ pages: [{ page: 2, at: 0 }], lines: [] });

describe.skipIf(!url)('Book sync suggestions migration (Postgres)', () => {
  let pool: pg.Pool;

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: url, max: 2 });
    await pool.query('drop schema public cascade; create schema public');
  });

  afterAll(async () => {
    await pool?.end();
  });

  it('marks seeded rows, not an admin save whose admin is gone', async () => {
    const all = await loadMigrations(join(import.meta.dirname, '..', 'migrations'));
    const before = all.filter((m) => m.id < '0044');
    expect(before.length).toBeLessThan(all.length);
    await migrate(pool, before, quiet);

    await pool.query(
      `insert into users (id, email, name, role) values ($1, 'chef@example.org', 'Chef', 'admin')`,
      [ADMIN]
    );
    await pool.query(
      `insert into book_sync (course, book, lesson, data, revision, updated_by) values
         ('madinah', 1, 1, $1::jsonb, 1, null),
         ('madinah', 1, 2, $1::jsonb, 1, $2)`,
      [data, ADMIN]
    );
    await pool.query(
      `insert into audit_log (actor_id, action, target_type, target_id, details)
       values ($1, 'content.book_sync_saved', 'book_sync', 'madinah/1/2', '{}')`,
      [ADMIN]
    );
    await pool.query('delete from users where id = $1', [ADMIN]);

    await migrate(pool, all, quiet);
    const { rows } = await pool.query<{ lesson: number; suggested: boolean }>(
      'select lesson, suggested from book_sync order by lesson'
    );
    expect(rows).toEqual([
      { lesson: 1, suggested: true },
      { lesson: 2, suggested: false },
    ]);
  });
});
