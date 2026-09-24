/**
 * Classes against a real Postgres (story 4.3): create, invite, join, approve, and the limits
 * (other teachers, learners, stale invites). Sign-in itself is covered by auth.pg; here the
 * caller is chosen by header. Run with SUFFA_TEST_DATABASE_URL; the database is wiped.
 */
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { AuthResolver } from '../src/auth/resolver.js';
import type { Role } from '../src/authz/policies.js';
import { PgClassRepository } from '../src/classes/repository.js';
import { loadMigrations, migrate } from '../src/migrate.js';

const url = process.env.SUFFA_TEST_DATABASE_URL;
const quiet = { info: () => undefined, warn: () => undefined, error: () => undefined };

describe.skipIf(!url)('Classes (Postgres)', () => {
  let pool: pg.Pool;
  let clock = new Date('2026-09-24T12:00:00.000Z');
  let app: ReturnType<typeof createApp>;
  const users: Record<string, { id: string; role: Role }> = {};

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: url, max: 4 });
    await pool.query('drop schema public cascade; create schema public');
    await migrate(
      pool,
      await loadMigrations(join(import.meta.dirname, '..', 'migrations')),
      quiet
    );
  });

  beforeEach(async () => {
    await pool.query('truncate users, classes, audit_log cascade');
    clock = new Date('2026-09-24T12:00:00.000Z');
    for (const [name, role] of [
      ['teacher', 'teacher'],
      ['otherTeacher', 'teacher'],
      ['amina', 'student'],
      ['bilal', 'student'],
    ] as const) {
      const id = randomUUID();
      await pool.query(
        'insert into users (id, email, name, role) values ($1, $2, $3, $4)',
        [
          id,
          `${name.toLowerCase()}@example.org`,
          name === 'teacher' ? 'Frau Yilmaz' : '',
          role,
        ]
      );
      users[name] = { id, role };
    }
    const auth: AuthResolver = {
      actor: async (headers) => {
        const who = headers.get('x-test-user');
        return who && users[who] ? users[who] : null;
      },
    };
    app = createApp({
      version: 'test',
      expectedRevision: null,
      health: {
        schemaRevision: async () => null,
        queueDepth: async () => ({ waiting: 0, active: 0, failed: 0, deadLetter: 0 }),
      },
      classes: {
        repo: new PgClassRepository(pool, () => clock),
        auth,
        log: quiet,
        publicUrl: 'https://suffa.example.org',
      },
    });
  });

  afterAll(async () => {
    await pool?.end();
  });

  const call = (who: string, method: string, path: string, body?: unknown) =>
    app.request(`/api/v1${path}`, {
      method,
      headers: { 'x-test-user': who, 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

  const newClassWithInvite = async () => {
    const created = await call('teacher', 'POST', '/classes', { name: 'Arabisch 1a' });
    expect(created.status).toBe(201);
    const { id } = (await created.json()) as { id: string };
    const invite = await call('teacher', 'POST', `/classes/${id}/invite`);
    const { url: link } = (await invite.json()) as { url: string };
    expect(link).toMatch(/^https:\/\/suffa\.example\.org\/join\/[A-Za-z0-9_-]{32}$/);
    return { id, token: link.split('/').at(-1)! };
  };

  it('a learner joins with the invite and waits for approval', async () => {
    const { id, token } = await newClassWithInvite();

    const preview = await call('amina', 'GET', `/invites/${token}`);
    expect(await preview.json()).toEqual({
      className: 'Arabisch 1a',
      teacherName: 'Frau Yilmaz',
    });
    const joined = await call('amina', 'POST', `/invites/${token}/join`);
    expect(await joined.json()).toMatchObject({ classId: id, status: 'pending' });
    // Joining twice changes nothing.
    expect(
      await (await call('amina', 'POST', `/invites/${token}/join`)).json()
    ).toMatchObject({
      status: 'pending',
    });

    const teacherView = (await (await call('teacher', 'GET', '/classes')).json()) as {
      classes: { pendingCount: number }[];
    };
    expect(teacherView.classes[0]).toMatchObject({ pendingCount: 1 });
    const approve = await call(
      'teacher',
      'POST',
      `/classes/${id}/members/${users.amina!.id}/approve`
    );
    expect(approve.status).toBe(204);

    const mine = (await (await call('amina', 'GET', '/classes')).json()) as {
      classes: Record<string, unknown>[];
    };
    expect(mine.classes).toEqual([
      expect.objectContaining({
        name: 'Arabisch 1a',
        classRole: 'student',
        status: 'active',
        studentCount: 0,
      }),
    ]);
    const audit = await pool.query('select action from audit_log order by id');
    expect(audit.rows.map((r) => r.action)).toEqual([
      'class.created',
      'class.invite_created',
      'class.join_requested',
      'class.member_approved',
    ]);
  });

  it('only the class teacher manages it; learners cannot create classes', async () => {
    const { id } = await newClassWithInvite();
    expect((await call('otherTeacher', 'GET', `/classes/${id}/members`)).status).toBe(
      403
    );
    expect((await call('otherTeacher', 'POST', `/classes/${id}/invite`)).status).toBe(
      403
    );
    expect((await call('amina', 'GET', `/classes/${id}/members`)).status).toBe(403);
    expect((await call('amina', 'POST', '/classes', { name: 'Meine' })).status).toBe(403);
    // Even an active learner of the class cannot manage it.
    await pool.query(
      "insert into class_members (class_id, user_id, class_role, status) values ($1, $2, 'student', 'active')",
      [id, users.bilal!.id]
    );
    expect((await call('bilal', 'GET', `/classes/${id}/members`)).status).toBe(403);
  });

  it('refuses expired and replaced invites; stores only the hash', async () => {
    const { id, token } = await newClassWithInvite();
    const stored = await pool.query('select token_hash from class_invites');
    expect(JSON.stringify(stored.rows)).not.toContain(token);

    // A new link replaces the old one.
    const { url: fresh } = (await (
      await call('teacher', 'POST', `/classes/${id}/invite`)
    ).json()) as {
      url: string;
    };
    expect((await call('amina', 'POST', `/invites/${token}/join`)).status).toBe(404);
    const freshToken = fresh.split('/').at(-1)!;
    // After 14 days the link expires.
    clock = new Date('2026-10-09T12:00:00.000Z');
    expect((await call('amina', 'POST', `/invites/${freshToken}/join`)).status).toBe(404);
    expect((await call('amina', 'GET', '/invites/not-a-token')).status).toBe(404);
  });

  it('removes and rejects learners, never the teacher', async () => {
    const { id, token } = await newClassWithInvite();
    await call('amina', 'POST', `/invites/${token}/join`);
    expect(
      (await call('teacher', 'DELETE', `/classes/${id}/members/${users.amina!.id}`))
        .status
    ).toBe(204);
    expect(await (await call('amina', 'GET', '/classes')).json()).toEqual({
      classes: [],
    });
    expect(
      (await call('teacher', 'DELETE', `/classes/${id}/members/${users.teacher!.id}`))
        .status
    ).toBe(404);
    const audit = await pool.query(
      "select action from audit_log where action like 'class.member%'"
    );
    expect(audit.rows.map((r) => r.action)).toEqual(['class.member_rejected']);
  });
});
