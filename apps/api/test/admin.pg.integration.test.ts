/**
 * Admin user list against a real Postgres: keyset pagination and literal search.
 * Run with SUFFA_TEST_DATABASE_URL=postgres://… ; skipped otherwise. The database is wiped.
 */
import { join } from 'node:path';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PgAdminRepository } from '../src/admin/repository.js';
import { loadMigrations, migrate } from '../src/migrate.js';

const url = process.env.SUFFA_TEST_DATABASE_URL;
const quiet = { info: () => undefined, warn: () => undefined, error: () => undefined };

describe.skipIf(!url)('PgAdminRepository', () => {
  let pool: pg.Pool;
  let repo: PgAdminRepository;

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: url, max: 2 });
    await pool.query('drop schema public cascade; create schema public');
    await migrate(
      pool,
      await loadMigrations(join(import.meta.dirname, '..', 'migrations')),
      quiet
    );
    repo = new PgAdminRepository(pool);
    // Five users one minute apart; two share a timestamp to exercise the id tie-break.
    await pool.query(`
      insert into users (id, email, name, role, created_at) values
        ('00000000-0000-4000-8000-000000000001', 'amina@example.org', 'Amina', 'student', '2026-09-01T10:00:00Z'),
        ('00000000-0000-4000-8000-000000000002', 'bilal@example.org', 'Bilal', 'teacher', '2026-09-01T10:01:00Z'),
        ('00000000-0000-4000-8000-000000000003', 'a_b@example.org',   '',    'student', '2026-09-01T10:02:00Z'),
        ('00000000-0000-4000-8000-000000000004', 'aXb@example.org',   null,    'student', '2026-09-01T10:02:00Z'),
        ('00000000-0000-4000-8000-000000000005', 'chef@example.org',  'Chef',  'admin',   '2026-09-01T10:03:00Z')`);
  });

  afterAll(async () => {
    await pool?.end();
  });

  it('pages newest first without gaps or repeats', async () => {
    const seen: string[] = [];
    let after = null;
    for (let i = 0; i < 5; i++) {
      const page = await repo.listUsers({ search: null, after, limit: 2 });
      seen.push(...page.users.map((u) => u.email!));
      if (!page.next) break;
      after = page.next;
    }
    expect(seen).toEqual([
      'chef@example.org',
      'aXb@example.org',
      'a_b@example.org',
      'bilal@example.org',
      'amina@example.org',
    ]);
  });

  it('searches email and name case-insensitively, wildcards literally', async () => {
    const names = async (search: string) =>
      (await repo.listUsers({ search, after: null, limit: 50 })).users.map(
        (u) => u.email
      );
    expect(await names('BILAL')).toEqual(['bilal@example.org']);
    expect(await names('chef')).toEqual(['chef@example.org']);
    // "_" must not match any character: only a_b, not aXb.
    expect(await names('a_b')).toEqual(['a_b@example.org']);
    expect(await names('%')).toEqual([]);
  });

  it('reports an empty name as no name', async () => {
    const { users } = await repo.listUsers({ search: 'a_b', after: null, limit: 1 });
    expect(users[0]!.name).toBeNull();
  });

  it('returns the fields the admin area shows', async () => {
    const { users } = await repo.listUsers({ search: 'chef', after: null, limit: 1 });
    expect(users[0]).toEqual({
      id: '00000000-0000-4000-8000-000000000005',
      email: 'chef@example.org',
      name: 'Chef',
      role: 'admin',
      emailVerified: false,
      disabled: false,
      createdAt: '2026-09-01T10:03:00.000Z',
    });
  });
});
