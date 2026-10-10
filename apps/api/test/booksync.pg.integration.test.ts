/**
 * The Medina book following the author's recording, against a real Postgres: anyone reads the
 * page and line timings, only admins with the second factor save them, revisions keep two
 * editors apart and every save is audit-logged.
 * Run with SUFFA_TEST_DATABASE_URL=postgres://… ; skipped otherwise. The database is wiped.
 */
import { join } from 'node:path';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { AuthResolver } from '../src/auth/resolver.js';
import { PgBookSyncRepository, type LessonSync } from '../src/booksync/repository.js';
import { loadMigrations, migrate } from '../src/migrate.js';

const url = process.env.SUFFA_TEST_DATABASE_URL;
const quiet = { info: () => undefined, warn: () => undefined, error: () => undefined };
const ADMIN = '00000000-0000-4000-8000-0000000000d1';
const TEACHER = '00000000-0000-4000-8000-0000000000d2';
const BOOK = '/api/v1/book-sync/madinah/1';

describe.skipIf(!url)('Book sync (Postgres)', () => {
  let pool: pg.Pool;
  let app: ReturnType<typeof createApp>;

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
         ($1, 'chef@example.org', 'Chef', 'admin'),
         ($2, 'lehrerin@example.org', 'Lehrerin', 'teacher')`,
      [ADMIN, TEACHER]
    );
    const auth: AuthResolver = {
      actor: async (h) => {
        const who = h.get('x-test-user');
        if (who === 'admin') return { id: ADMIN, role: 'admin', secondFactor: true };
        if (who === 'admin-no-2fa') return { id: ADMIN, role: 'admin' };
        if (who === 'teacher') return { id: TEACHER, role: 'teacher' };
        return null;
      },
    };
    app = createApp({
      version: 'test',
      expectedRevision: null,
      health: {
        schemaRevision: async () => null,
        queueDepth: async () => ({ waiting: 0, active: 0, failed: 0, deadLetter: 0 }),
      },
      bookSync: { repo: new PgBookSyncRepository(pool), auth, log: quiet },
    });
  });

  afterAll(async () => {
    await pool?.end();
  });

  const call = (
    method: string,
    path: string,
    user?: string,
    body?: unknown,
    headers: Record<string, string> = {}
  ) =>
    app.request(path, {
      method,
      headers: {
        ...headers,
        ...(user ? { 'x-test-user': user } : {}),
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  const lessons = async () =>
    ((await (await call('GET', BOOK)).json()) as { lessons: LessonSync[] }).lessons;

  const pages = [
    { page: 2, at: 0 },
    { page: 3, at: 95.5 },
  ];

  it('starts empty and is public', async () => {
    const res = await call('GET', BOOK);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ course: 'madinah', book: 1, lessons: [] });
    expect(res.headers.get('cache-control')).toBe('public, no-cache');
  });

  it('lets only admins with the second factor save', async () => {
    const body = { revision: 0, pages };
    expect((await call('PUT', `${BOOK}/1`, undefined, body)).status).toBe(401);
    expect((await call('PUT', `${BOOK}/1`, 'teacher', body)).status).toBe(403);
    expect((await call('PUT', `${BOOK}/1`, 'admin-no-2fa', body)).status).toBe(403);
    expect(await lessons()).toEqual([]);
  });

  it('saves a lesson, revision by revision, and logs who did', async () => {
    const first = await call('PUT', `${BOOK}/1`, 'admin', { revision: 0, pages });
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({ revision: 1 });

    const line = { page: 2, box: [0.1, 0.1, 0.8, 0.05], start: 1, end: 3.5 };
    const second = await call('PUT', `${BOOK}/1`, 'admin', {
      revision: 1,
      pages,
      lines: [line],
    });
    expect(await second.json()).toEqual({ revision: 2 });

    // Someone saving on the old revision is refused, a second "first" save too.
    expect((await call('PUT', `${BOOK}/1`, 'admin', { revision: 1, pages })).status).toBe(
      409
    );
    expect((await call('PUT', `${BOOK}/1`, 'admin', { revision: 0, pages })).status).toBe(
      409
    );

    expect(await lessons()).toEqual([
      expect.objectContaining({ lesson: 1, revision: 2, pages, lines: [line] }),
    ]);
    const { rows } = await pool.query<{ actor_id: string; details: object }>(
      `select actor_id, details from audit_log where action = 'content.book_sync_saved'
        order by id`
    );
    expect(rows).toEqual([
      { actor_id: ADMIN, details: { revision: 1, pages: 2, lines: 0 } },
      { actor_id: ADMIN, details: { revision: 2, pages: 2, lines: 1 } },
    ]);
  });

  it('answers 304 while nothing changed', async () => {
    const res = await call('GET', BOOK);
    const etag = res.headers.get('etag')!;
    expect(etag).toMatch(/^"[0-9a-f]{32}"$/);
    expect(
      (await call('GET', BOOK, undefined, undefined, { 'if-none-match': etag })).status
    ).toBe(304);
  });

  it('refuses invalid timings and unknown lessons', async () => {
    const bad = await call('PUT', `${BOOK}/2`, 'admin', {
      revision: 0,
      pages: [
        { page: 3, at: 10 },
        { page: 4, at: 5 },
      ],
    });
    expect(bad.status).toBe(422);
    expect(await bad.json()).toEqual({
      error: 'invalid_sync',
      issues: ['pages.1: starts before the page before'],
    });
    expect((await call('PUT', `${BOOK}/2`, 'admin', { pages })).status).toBe(400);
    expect(
      (await call('PUT', `${BOOK}/100`, 'admin', { revision: 0, pages })).status
    ).toBe(404);
    expect((await call('GET', '/api/v1/book-sync/Medina/1')).status).toBe(404);
  });
});
