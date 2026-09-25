/**
 * GDPR export and account deletion against a real Postgres (story 4.4).
 * Run with SUFFA_TEST_DATABASE_URL; the database is wiped.
 */
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { loadMigrations, migrate } from '../src/migrate.js';
import { PgClassRepository } from '../src/classes/repository.js';
import { PgPrivacyRepository } from '../src/privacy/repository.js';
import { PgSyncRepository } from '../src/sync/repository.js';

const url = process.env.SUFFA_TEST_DATABASE_URL;
const quiet = { info: () => undefined, warn: () => undefined, error: () => undefined };

describe.skipIf(!url)('Privacy: export and delete (Postgres)', () => {
  let pool: pg.Pool;
  let repo: PgPrivacyRepository;
  let amina: string;
  let teacher: string;

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: url, max: 4 });
    await pool.query('drop schema public cascade; create schema public');
    await migrate(
      pool,
      await loadMigrations(join(import.meta.dirname, '..', 'migrations')),
      quiet
    );
    repo = new PgPrivacyRepository(pool);
  });

  beforeEach(async () => {
    await pool.query('truncate users, classes, audit_log cascade');
    amina = randomUUID();
    teacher = randomUUID();
    await pool.query(
      `insert into users (id, email, role) values ($1, 'amina@example.org', 'student'),
                                                   ($2, 'lehrerin@example.org', 'teacher')`,
      [amina, teacher]
    );
    const at = '2026-09-24T10:00:00.000Z';
    const sync = new PgSyncRepository(pool);
    await sync.upsert(amina, 'practice_progress', [
      {
        id: '1:read:d-1',
        updated_at: at,
        deleted: false,
        unit: 1,
        skill: 'read',
        itemId: 'd-1',
        practisedAt: at,
      },
    ]);
    await sync.upsert(amina, 'daily_checkins', [
      { id: '2026-09-24', updated_at: at, deleted: false, wordId: 'v-1', checkedAt: at },
    ]);
    await pool.query(
      `insert into sessions (id, user_id, token, expires_at, user_agent)
       values ('s-1', $1, 'secret-token-value', now() + interval '1 day', 'Firefox')`,
      [amina]
    );
    await pool.query(
      "insert into user_totp (user_id, secret_enc) values ($1, 'sealed')",
      [amina]
    );
  });

  afterAll(async () => {
    await pool?.end();
  });

  it('exports profile, devices, learning data and classes – never tokens or secrets', async () => {
    const data = await repo.export(amina);
    expect(data.profile).toMatchObject({ email: 'amina@example.org', role: 'student' });
    expect(data.learningData.practice_progress).toEqual([
      expect.objectContaining({ id: '1:read:d-1', unit: 1, skill: 'read' }),
    ]);
    expect(data.learningData.daily_checkins).toHaveLength(1);
    expect(data.learningData.srs_cards).toEqual([]);
    expect(data.engagement).toEqual({
      state: null,
      xpLedger: [],
      quests: [],
      achievements: [],
    });
    expect(data.classRecognition).toEqual({ badges: [], shoutouts: [], challenges: [] });
    expect(data.notifications).toEqual({ prefs: null, devices: [], recaps: [] });
    expect(data.tutor).toEqual({
      conversations: [],
      messages: [],
      usage: [],
      grades: [],
    });
    expect(data.sessions).toEqual([expect.objectContaining({ user_agent: 'Firefox' })]);
    const text = JSON.stringify(data);
    expect(text).not.toContain('secret-token-value');
    expect(text).not.toContain('sealed');
    expect(text).not.toContain('synced_at');
  });

  it('deletes everything that belongs to the account, in every table with a user_id', async () => {
    const classes = new PgClassRepository(pool);
    await classes.create({ id: amina, ip: null }, 'Aminas Lerngruppe');
    const shared = await classes.create({ id: teacher, ip: null }, 'Arabisch 1a');
    await pool.query(
      "insert into class_members (class_id, user_id, class_role, status) values ($1, $2, 'student', 'active')",
      [shared.id, amina]
    );

    expect(await repo.delete(amina, '203.0.113.9')).toBe(true);

    const { rows: tables } = await pool.query<{ table_name: string }>(
      `select table_name from information_schema.columns
        where table_schema = 'public' and column_name = 'user_id'`
    );
    expect(tables.length).toBeGreaterThan(10);
    for (const { table_name } of tables) {
      const { rows } = await pool.query(
        `select count(*)::int as n from "${table_name}" where user_id = $1`,
        [amina]
      );
      expect(rows[0].n, table_name).toBe(0);
    }
    // Her own class (she was its only teacher) is archived; the teacher's class stays.
    const { rows: left } = await pool.query(
      'select name, archived_at is not null as archived from classes order by name'
    );
    expect(left).toEqual([
      { name: 'Aminas Lerngruppe', archived: true },
      { name: 'Arabisch 1a', archived: false },
    ]);
    // The audit log keeps the record without the person.
    const { rows: audit } = await pool.query(
      "select actor_id, target_id from audit_log where action = 'account.deleted'"
    );
    expect(audit).toEqual([{ actor_id: null, target_id: amina }]);
    expect(await repo.delete(amina, null)).toBe(false);
  });
});
