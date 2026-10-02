/**
 * Testers' feedback against a real Postgres: sending (with and without an account), the
 * admin inbox with paging and the open count, marking done, and the switch.
 * Run with SUFFA_TEST_DATABASE_URL=postgres://… ; skipped otherwise. The database is wiped.
 */
import { join } from 'node:path';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { AuthResolver } from '../src/auth/resolver.js';
import { PgFeedbackRepository } from '../src/feedback/repository.js';
import { loadMigrations, migrate } from '../src/migrate.js';
import { RateLimiter } from '../src/observability/tunnel.js';

const url = process.env.SUFFA_TEST_DATABASE_URL;
const quiet = { info: () => undefined, warn: () => undefined, error: () => undefined };
const ADMIN = '00000000-0000-4000-8000-0000000000a1';
const AMINA = '00000000-0000-4000-8000-0000000000a2';

describe.skipIf(!url)('Feedback (Postgres)', () => {
  let pool: pg.Pool;
  let app: ReturnType<typeof createApp>;
  let closed: ReturnType<typeof createApp>;

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: url, max: 4 });
    await pool.query('drop schema public cascade; create schema public');
    await migrate(
      pool,
      await loadMigrations(join(import.meta.dirname, '..', 'migrations')),
      quiet
    );
    await pool.query(
      `insert into users (id, email, name, role) values
         ($1, 'chef@example.org', 'Chef', 'admin'), ($2, 'amina@example.org', 'Amina', 'student')`,
      [ADMIN, AMINA]
    );
    const auth: AuthResolver = {
      actor: async (h) => {
        const who = h.get('x-test-user');
        if (who === 'admin') return { id: ADMIN, role: 'admin', secondFactor: true };
        if (who === 'admin-no-2fa') return { id: ADMIN, role: 'admin' };
        if (who === 'amina') return { id: AMINA, role: 'student' };
        return null;
      },
    };
    const health = {
      schemaRevision: async () => null,
      queueDepth: async () => ({ waiting: 0, active: 0, failed: 0, deadLetter: 0 }),
    };
    const repo = new PgFeedbackRepository(pool);
    app = createApp({
      version: 'test',
      expectedRevision: null,
      health,
      feedback: {
        repo,
        auth,
        log: quiet,
        enabled: true,
        limiter: new RateLimiter(5, 60_000),
      },
      errorTunnel: { webDsn: undefined, feedback: true, log: quiet },
    });
    closed = createApp({
      version: 'test',
      expectedRevision: null,
      health,
      feedback: { repo, auth, log: quiet, enabled: false },
      errorTunnel: { webDsn: undefined, feedback: false, log: quiet },
    });
  });

  afterAll(async () => {
    await pool?.end();
  });

  const call = (method: string, path: string, body?: unknown, user?: string) =>
    app.request(path, {
      method,
      headers: {
        'content-type': 'application/json',
        'user-agent': 'TestBrowser/1.0',
        ...(user ? { 'x-test-user': user } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

  it('takes feedback from testers with and without an account', async () => {
    expect(
      (await (await app.request('/api/client-config')).json()) as { feedback: boolean }
    ).toMatchObject({ feedback: true });
    expect(
      (
        await call(
          'POST',
          '/api/v1/feedback',
          {
            kind: 'confusing',
            message: 'Wo finde ich meine Klasse?',
            page: '/',
            appVersion: 'sha-abc1234',
          },
          'amina'
        )
      ).status
    ).toBe(201);
    expect(
      (
        await call('POST', '/api/v1/feedback', {
          kind: 'bug',
          message: 'Der Test lädt nicht.',
          page: '/units/madinah/3?x=1',
        })
      ).status
    ).toBe(201);

    // Bad input: unknown kind, empty text, a full URL instead of an app path, extra fields.
    for (const body of [
      { kind: 'rant', message: 'x', page: '/' },
      { kind: 'bug', message: '   ', page: '/' },
      { kind: 'bug', message: 'x', page: 'https://evil.example/' },
      { kind: 'bug', message: 'x', page: '/', userId: ADMIN },
    ]) {
      expect((await call('POST', '/api/v1/feedback', body)).status).toBe(400);
    }
    expect(
      (
        await app.request('/api/v1/feedback', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: '{not json',
        })
      ).status
    ).toBe(400);
  });

  it('shows the admins an inbox, newest first, and lets them mark items done', async () => {
    // Only admins with a confirmed second factor read it.
    expect((await call('GET', '/api/v1/admin/feedback')).status).toBe(401);
    expect((await call('GET', '/api/v1/admin/feedback', undefined, 'amina')).status).toBe(
      403
    );
    expect(
      (await call('GET', '/api/v1/admin/feedback', undefined, 'admin-no-2fa')).status
    ).toBe(403);

    const first = (await (
      await call('GET', '/api/v1/admin/feedback?limit=1', undefined, 'admin')
    ).json()) as {
      items: { id: string; kind: string; page: string; sender: unknown }[];
      next: string | null;
      open: number;
    };
    expect(first.open).toBe(2);
    expect(first.items).toHaveLength(1);
    expect(first.items[0]).toMatchObject({
      kind: 'bug',
      page: '/units/madinah/3?x=1',
      sender: null,
    });
    const second = (await (
      await call(
        'GET',
        `/api/v1/admin/feedback?limit=1&before=${first.next}`,
        undefined,
        'admin'
      )
    ).json()) as {
      items: {
        id: string;
        message: string;
        appVersion: string;
        userAgent: string;
        sender: unknown;
      }[];
      next: string | null;
    };
    expect(second.next).toBeNull();
    expect(second.items[0]).toMatchObject({
      message: 'Wo finde ich meine Klasse?',
      appVersion: 'sha-abc1234',
      userAgent: 'TestBrowser/1.0',
      sender: { id: AMINA, name: 'Amina', email: 'amina@example.org', role: 'student' },
    });

    const id = second.items[0]!.id;
    expect(
      (await call('PATCH', `/api/v1/admin/feedback/${id}`, { status: 'done' }, 'amina'))
        .status
    ).toBe(403);
    expect(
      (await call('PATCH', `/api/v1/admin/feedback/${id}`, { status: 'done' }, 'admin'))
        .status
    ).toBe(204);
    expect(
      (
        await call(
          'PATCH',
          '/api/v1/admin/feedback/00000000-0000-4000-8000-000000000000',
          { status: 'done' },
          'admin'
        )
      ).status
    ).toBe(404);
    expect(
      (await call('PATCH', `/api/v1/admin/feedback/${id}`, { status: 'gone' }, 'admin'))
        .status
    ).toBe(400);
    const after = (await (
      await call('GET', '/api/v1/admin/feedback', undefined, 'admin')
    ).json()) as { open: number };
    expect(after.open).toBe(1);
  });

  it('keeps floods out and can be switched off', async () => {
    // The limiter allows five per minute; two were sent above.
    const send = () =>
      call('POST', '/api/v1/feedback', {
        kind: 'idea',
        message: 'Mehr Farbe',
        page: '/',
      });
    const statuses = [];
    for (let i = 0; i < 4; i++) statuses.push((await send()).status);
    expect(statuses).toEqual([201, 201, 201, 429]);

    expect(
      (
        await closed.request('/api/v1/feedback', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ kind: 'idea', message: 'x', page: '/' }),
        })
      ).status
    ).toBe(404);
    expect(
      (await (await closed.request('/api/client-config')).json()) as { feedback: boolean }
    ).toMatchObject({ feedback: false });
  });
});
