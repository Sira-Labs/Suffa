import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  currentRevision,
  expectedRevision,
  loadMigrations,
  migrate,
  type Migration,
  type SqlClient,
  type SqlPool,
} from '../src/migrate.js';

/** Fake pool that records statements and simulates schema_migrations contents. */
function fakePool(applied: string[], failOn?: string) {
  const statements: string[] = [];
  let released = 0;
  const client: SqlClient = {
    async query<R extends Record<string, unknown>>(text: string, values?: unknown[]) {
      statements.push(text.trim().split('\n')[0]!);
      if (failOn && text === failOn) throw new Error('boom');
      if (text.startsWith('select id from schema_migrations')) {
        return { rows: applied.map((id) => ({ id })) as unknown as R[] };
      }
      if (text.startsWith('insert into schema_migrations'))
        applied.push(String(values?.[0]));
      return { rows: [] as R[] };
    },
    release: () => {
      released++;
    },
  };
  const pool: SqlPool = { connect: async () => client };
  return { pool, statements, released: () => released };
}

const log = { info: () => undefined };
const M1: Migration = { id: '0001_a', sql: 'create table a ()' };
const M2: Migration = { id: '0002_b', sql: 'create table b ()' };

describe('migrate', () => {
  it('applies pending migrations in order inside transactions, under the advisory lock', async () => {
    const { pool, statements, released } = fakePool([]);
    const revision = await migrate(pool, [M1, M2], log);
    expect(revision).toBe('0002_b');
    expect(statements[0]).toContain('pg_advisory_lock');
    expect(statements).toEqual(
      expect.arrayContaining([
        'begin',
        'create table a ()',
        'commit',
        'create table b ()',
      ])
    );
    expect(statements.indexOf('create table a ()')).toBeLessThan(
      statements.indexOf('create table b ()')
    );
    expect(statements.at(-1)).toContain('pg_advisory_unlock');
    expect(released()).toBe(1);
  });

  it('skips already applied migrations', async () => {
    const { pool, statements } = fakePool(['0001_a']);
    await migrate(pool, [M1, M2], log);
    expect(statements).not.toContain('create table a ()');
    expect(statements).toContain('create table b ()');
  });

  it('rolls back and unlocks when a migration fails', async () => {
    const { pool, statements, released } = fakePool([], 'create table b ()');
    await expect(migrate(pool, [M1, M2], log)).rejects.toThrow('boom');
    expect(statements).toContain('rollback');
    expect(statements.at(-1)).toContain('pg_advisory_unlock');
    expect(released()).toBe(1);
  });
});

describe('loadMigrations', () => {
  it('loads only NNNN_name.sql files in lexical order', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'mig-'));
    await writeFile(join(dir, '0002_second.sql'), 'select 2');
    await writeFile(join(dir, '0001_first.sql'), 'select 1');
    await writeFile(join(dir, 'README.md'), 'ignore me');
    const migrations = await loadMigrations(dir);
    expect(migrations.map((m) => m.id)).toEqual(['0001_first', '0002_second']);
    expect(expectedRevision(migrations)).toBe('0002_second');
  });

  it('ships a valid first migration', async () => {
    const migrations = await loadMigrations(
      join(import.meta.dirname, '..', 'migrations')
    );
    expect(migrations[0]?.id).toBe('0001_service_heartbeats');
  });
});

describe('currentRevision', () => {
  function pool(tableExists: boolean, maxId: string | null) {
    const queries: string[] = [];
    const client: SqlClient = {
      async query<R extends Record<string, unknown>>(text: string) {
        queries.push(text);
        if (text.includes('to_regclass'))
          return { rows: [{ present: tableExists }] as unknown as R[] };
        if (!tableExists) throw new Error('relation "schema_migrations" does not exist');
        return { rows: [{ id: maxId }] as unknown as R[] };
      },
      release: () => undefined,
    };
    return { pool: { connect: async () => client } as SqlPool, queries };
  }

  it('returns null without touching schema_migrations when it does not exist', async () => {
    const { pool: p, queries } = pool(false, null);
    await expect(currentRevision(p)).resolves.toBeNull();
    expect(queries).toHaveLength(1);
  });

  it('returns the newest applied id', async () => {
    const { pool: p } = pool(true, '0003_c');
    await expect(currentRevision(p)).resolves.toBe('0003_c');
  });
});
