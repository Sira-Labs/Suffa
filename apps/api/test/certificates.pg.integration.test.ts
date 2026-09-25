/**
 * Unit certificates (story 14.3) against Postgres: eligibility from mature cards, the
 * server's re-check on award, one certificate per learner and unit, and who may see what.
 */
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { AuthResolver } from '../src/auth/resolver.js';
import type { Role } from '../src/authz/policies.js';
import { PgCertificateRepository } from '../src/classes/certificates.js';
import { PgClassRepository } from '../src/classes/repository.js';
import { loadMigrations, migrate } from '../src/migrate.js';

const url = process.env.SUFFA_TEST_DATABASE_URL;
const quiet = { info: () => undefined, warn: () => undefined, error: () => undefined };
const UNIT_WORDS = Array.from({ length: 10 }, (_, i) => `u1-w${i}`);

describe.skipIf(!url)('Unit certificates (Postgres)', () => {
  let pool: pg.Pool;
  let app: ReturnType<typeof createApp>;
  let classId: string;
  const users: Record<string, { id: string; role: Role }> = {};

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: url, max: 4 });
    await pool.query('drop schema public cascade; create schema public');
    await migrate(
      pool,
      await loadMigrations(join(import.meta.dirname, '..', 'migrations')),
      quiet
    );
    const auth: AuthResolver = {
      actor: async (h) => users[h.get('x-test-user') ?? ''] ?? null,
    };
    app = createApp({
      version: 'test',
      expectedRevision: null,
      health: {
        schemaRevision: async () => null,
        queueDepth: async () => ({ waiting: 0, active: 0, failed: 0, deadLetter: 0 }),
      },
      certificates: {
        classes: new PgClassRepository(pool),
        certificates: new PgCertificateRepository(pool, [
          { unit: 1, title: 'Begrüßung', wordIds: UNIT_WORDS },
          { unit: 2, title: 'Familie', wordIds: ['u2-w0'] },
        ]),
        auth,
        log: quiet,
      },
    });
  });

  beforeEach(async () => {
    await pool.query('truncate users, classes, audit_log, certificates cascade');
    for (const [name, role] of [
      ['teacher', 'teacher'],
      ['other', 'teacher'],
      ['amina', 'student'],
      ['bilal', 'student'],
    ] as const) {
      const id = randomUUID();
      await pool.query(
        'insert into users (id, email, name, role) values ($1, $2, $3, $4)',
        [id, `${name}@example.org`, name[0]!.toUpperCase() + name.slice(1), role]
      );
      users[name] = { id, role };
    }
    classId = randomUUID();
    await pool.query("insert into classes (id, name) values ($1, 'Arabisch 1a')", [
      classId,
    ]);
    for (const [user, classRole] of [
      ['teacher', 'teacher'],
      ['amina', 'student'],
      ['bilal', 'student'],
    ]) {
      await pool.query(
        `insert into class_members (class_id, user_id, class_role, status)
         values ($1, $2, $3, 'active')`,
        [classId, users[user!]!.id, classRole]
      );
    }
  });

  afterAll(async () => {
    await pool?.end();
  });

  /** `mature` of the unit's words known firmly (interval 30), the rest young (interval 3). */
  const cards = async (user: string, mature: number) => {
    for (const [i, ref] of UNIT_WORDS.entries()) {
      await pool.query(
        `insert into srs_cards (user_id, id, "contentRef", kind, interval, ease, reps, lapses,
                                due, "lastReviewed", leech, updated_at, deleted)
         values ($1, $2, $3, 'vocab_ar_de', $4, 2.5, 3, 0, now(), now(), false, now(), false)`,
        [users[user]!.id, `vocab_ar_de:${ref}`, ref, i < mature ? 30 : 3]
      );
    }
  };

  const call = (who: string, method: string, path: string, body?: unknown) =>
    app.request(`/api/v1${path}`, {
      method,
      headers: { 'x-test-user': who, 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

  it('lists learners at 90 % mastery and awards them once', async () => {
    await cards('amina', 9);
    await cards('bilal', 8);
    const overview = (await (
      await call('teacher', 'GET', `/classes/${classId}/certificates`)
    ).json()) as { threshold: number; eligible: unknown[] };
    expect(overview.threshold).toBe(90);
    expect(overview.eligible).toEqual([
      {
        userId: users.amina!.id,
        name: 'Amina',
        unit: 1,
        unitTitle: 'Begrüßung',
        mastery: 90,
      },
    ]);

    const award = await call('teacher', 'POST', `/classes/${classId}/certificates`, {
      userId: users.amina!.id,
      unit: 1,
    });
    expect(award.status).toBe(201);
    expect(await award.json()).toMatchObject({
      learnerName: 'Amina',
      unit: 1,
      unitTitle: 'Begrüßung',
      mastery: 90,
      className: 'Arabisch 1a',
      teacherName: 'Teacher',
    });
    // Once per learner and unit; Bilal at 80 % is refused by the server's own check.
    expect(
      (
        await call('teacher', 'POST', `/classes/${classId}/certificates`, {
          userId: users.amina!.id,
          unit: 1,
        })
      ).status
    ).toBe(409);
    const refused = await call('teacher', 'POST', `/classes/${classId}/certificates`, {
      userId: users.bilal!.id,
      unit: 1,
    });
    expect(refused.status).toBe(409);
    expect(await refused.json()).toEqual({ error: 'not_eligible' });

    const after = (await (
      await call('teacher', 'GET', `/classes/${classId}/certificates`)
    ).json()) as { eligible: unknown[]; awarded: { learnerName: string }[] };
    expect(after.eligible).toEqual([]);
    expect(after.awarded.map((c) => c.learnerName)).toEqual(['Amina']);
  });

  it('shows learners their own certificates only, and lets the teacher revoke one', async () => {
    await cards('amina', 10);
    const created = (await (
      await call('teacher', 'POST', `/classes/${classId}/certificates`, {
        userId: users.amina!.id,
        unit: 1,
      })
    ).json()) as { id: string };
    const mine = (await (await call('amina', 'GET', '/certificates')).json()) as {
      certificates: { id: string; mastery: number }[];
    };
    expect(mine.certificates).toMatchObject([{ id: created.id, mastery: 100 }]);
    expect(await (await call('bilal', 'GET', '/certificates')).json()).toEqual({
      certificates: [],
    });

    // Learners and other teachers cannot award or list the class.
    expect((await call('amina', 'GET', `/classes/${classId}/certificates`)).status).toBe(
      403
    );
    expect(
      (
        await call('other', 'POST', `/classes/${classId}/certificates`, {
          userId: users.amina!.id,
          unit: 2,
        })
      ).status
    ).toBe(403);
    expect(
      (
        await call('teacher', 'POST', `/classes/${classId}/certificates`, {
          userId: users.amina!.id,
          unit: 7,
        })
      ).status
    ).toBe(400);

    expect(
      (await call('teacher', 'DELETE', `/classes/${classId}/certificates/${created.id}`))
        .status
    ).toBe(204);
    expect(await (await call('amina', 'GET', '/certificates')).json()).toEqual({
      certificates: [],
    });
    const audit = await pool.query(
      "select action from audit_log where action like 'certificate.%' order by created_at"
    );
    expect(audit.rows.map((r) => r.action)).toEqual([
      'certificate.awarded',
      'certificate.revoked',
    ]);
  });
});
