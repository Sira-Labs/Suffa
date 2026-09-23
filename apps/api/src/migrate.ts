/**
 * Minimal, dependency-free SQL migration runner.
 *
 * - Migrations are `migrations/NNNN_name.sql`, applied in lexical order, each in its own
 *   transaction, recorded in `schema_migrations`.
 * - A Postgres advisory lock serialises concurrent starts (two api instances during a
 *   rolling deploy), mirroring ADR-0013.
 * - The revision is the id of the newest applied migration; the worker refuses to run
 *   until it matches the revision its image ships (exit code 3, like Tabayyun).
 */
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

export interface Migration {
  id: string;
  sql: string;
}

/** Subset of `pg.PoolClient` the runner needs (keeps the runner unit-testable). */
export interface SqlClient {
  query<R extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    values?: unknown[]
  ): Promise<{ rows: R[] }>;
  release(): void;
}

export interface SqlPool {
  connect(): Promise<SqlClient>;
}

export interface MigrationLogger {
  info(obj: object, msg: string): void;
}

/** Arbitrary constant key for `pg_advisory_lock`; unique to this application. */
export const MIGRATION_LOCK_KEY = 7_281_150_001;

const MIGRATION_FILE = /^(\d{4}_[a-z0-9_]+)\.sql$/;

export class SchemaMismatchError extends Error {
  constructor(
    readonly expected: string | null,
    readonly actual: string | null
  ) {
    super(
      `database schema is at ${actual ?? 'none'}, this build expects ${expected ?? 'none'}`
    );
    this.name = 'SchemaMismatchError';
  }
}

export async function loadMigrations(dir: string): Promise<Migration[]> {
  const files = (await readdir(dir)).filter((f) => MIGRATION_FILE.test(f)).sort();
  return Promise.all(
    files.map(async (file) => ({
      id: file.replace(/\.sql$/, ''),
      sql: await readFile(join(dir, file), 'utf8'),
    }))
  );
}

export function expectedRevision(migrations: Migration[]): string | null {
  return migrations.length > 0 ? migrations[migrations.length - 1]!.id : null;
}

const CREATE_TABLE = `create table if not exists schema_migrations (
  id text primary key,
  applied_at timestamptz not null default now()
)`;

/** Applies pending migrations; returns the resulting revision. */
export async function migrate(
  pool: SqlPool,
  migrations: Migration[],
  log: MigrationLogger
): Promise<string | null> {
  const client = await pool.connect();
  try {
    await client.query('select pg_advisory_lock($1)', [MIGRATION_LOCK_KEY]);
    await client.query(CREATE_TABLE);
    const { rows } = await client.query<{ id: string }>(
      'select id from schema_migrations'
    );
    const applied = new Set(rows.map((r) => r.id));

    for (const migration of migrations) {
      if (applied.has(migration.id)) continue;
      await client.query('begin');
      try {
        await client.query(migration.sql);
        await client.query('insert into schema_migrations (id) values ($1)', [
          migration.id,
        ]);
        await client.query('commit');
      } catch (error) {
        await client.query('rollback');
        throw error;
      }
      log.info({ migration: migration.id }, 'migrate.applied');
    }
    const revision = expectedRevision(migrations);
    log.info({ revision }, 'migrate.done');
    return revision;
  } finally {
    try {
      await client.query('select pg_advisory_unlock($1)', [MIGRATION_LOCK_KEY]);
    } finally {
      client.release();
    }
  }
}

/** Newest applied migration id, or null when the table does not exist yet. */
export async function currentRevision(pool: SqlPool): Promise<string | null> {
  const client = await pool.connect();
  try {
    // Two statements on purpose: Postgres resolves every relation at parse time, so a single
    // query mentioning schema_migrations fails before the api has created it.
    const exists = await client.query<{ present: boolean }>(
      "select to_regclass('schema_migrations') is not null as present"
    );
    if (!exists.rows[0]?.present) return null;
    const { rows } = await client.query<{ id: string | null }>(
      'select max(id) as id from schema_migrations'
    );
    return rows[0]?.id ?? null;
  } finally {
    client.release();
  }
}
