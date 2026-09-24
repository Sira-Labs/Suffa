/**
 * Sign-in by magic link against a real Postgres (Better Auth with our table mapping).
 * Run with SUFFA_TEST_DATABASE_URL=postgres://… ; skipped otherwise. The database is wiped.
 */
import { join } from 'node:path';
import pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { ChainResolver, createAuth, SessionResolver } from '../src/auth/betterAuth.js';
import type { Mailer } from '../src/auth/mailer.js';
import { loadMigrations, migrate } from '../src/migrate.js';
import { PgSyncRepository } from '../src/sync/repository.js';
import { PgAdminRepository } from '../src/admin/repository.js';

const url = process.env.SUFFA_TEST_DATABASE_URL;
const PUBLIC_URL = 'http://localhost:5173';
const quiet = { info: () => undefined, warn: () => undefined, error: () => undefined };

class CapturingMailer implements Mailer {
  links: { email: string; url: string }[] = [];
  async sendMagicLink(email: string, url: string): Promise<void> {
    this.links.push({ email, url });
  }
}

describe.skipIf(!url)('Magic-link sign-in (Postgres)', () => {
  let pool: pg.Pool;
  let mailer: CapturingMailer;
  let app: ReturnType<typeof createApp>;

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
    await pool.query('truncate users, rate_limits, verifications cascade');
    mailer = new CapturingMailer();
    const auth = createAuth({
      pool,
      secret: 'test-secret-0123456789-abcdefghijklmnop',
      publicUrl: PUBLIC_URL,
      mailer,
      production: false,
      rateLimit: true,
    });
    const sessions = new SessionResolver(auth);
    app = createApp({
      version: 'test',
      expectedRevision: null,
      health: {
        schemaRevision: async () => null,
        queueDepth: async () => ({ waiting: 0, active: 0, failed: 0, deadLetter: 0 }),
      },
      sync: {
        repo: new PgSyncRepository(pool),
        auth: new ChainResolver([sessions]),
        log: quiet,
      },
      auth: { handler: (request) => auth.handler(request), me: (h) => sessions.me(h) },
      admin: { repo: new PgAdminRepository(pool), auth: sessions, log: quiet },
    });
  });

  afterAll(async () => {
    await pool?.end();
  });

  const requestLink = (email: string, ip = '203.0.113.7') =>
    app.request('/api/v1/auth/sign-in/magic-link', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: PUBLIC_URL,
        'x-forwarded-for': ip,
      },
      body: JSON.stringify({ email, callbackURL: '/settings' }),
    });

  /** Opens the link from the mail; returns the response and the session cookie. */
  const openLink = async (link: string) => {
    const target = new URL(link);
    expect(target.origin).toBe(PUBLIC_URL);
    const response = await app.request(`${target.pathname}${target.search}`, {
      headers: { 'x-forwarded-for': '203.0.113.7' },
    });
    const cookie = (response.headers.getSetCookie?.() ?? [])
      .map((c) => c.split(';')[0])
      .filter((c) => c?.startsWith('suffa.session_token='))
      .join('; ');
    return { response, cookie };
  };

  it('signs in with the link from the mail and knows the user', async () => {
    expect((await requestLink('Amina@Example.org')).status).toBe(200);
    expect(mailer.links).toHaveLength(1);
    expect(mailer.links[0]!.email.toLowerCase()).toBe('amina@example.org');

    const { response, cookie } = await openLink(mailer.links[0]!.url);
    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe(`${PUBLIC_URL}/settings`);
    expect(cookie).toMatch(/^suffa\.session_token=/);

    const me = await app.request('/api/v1/me', { headers: { cookie } });
    expect(me.status).toBe(200);
    const body = (await me.json()) as { id: string; email: string; role: string };
    expect(body).toMatchObject({ email: 'amina@example.org', role: 'student' });
    expect(body.id).toMatch(/^[0-9a-f-]{36}$/);

    // The session opens sync for exactly this user.
    const pull = await app.request('/api/v1/sync/srs_cards/pull', {
      headers: { cookie },
    });
    expect(pull.status).toBe(200);
    const stored = await pool.query('select email_verified from users where id = $1', [
      body.id,
    ]);
    expect(stored.rows[0]).toEqual({ email_verified: true });
  });

  it('uses each link only once and stores it hashed', async () => {
    await requestLink('once@example.org');
    const link = mailer.links[0]!.url;
    const token = new URL(link).searchParams.get('token')!;
    const stored = await pool.query('select identifier, value from verifications');
    expect(JSON.stringify(stored.rows)).not.toContain(token);

    expect((await openLink(link)).cookie).not.toBe('');
    const second = await openLink(link);
    expect(second.cookie).toBe('');
  });

  it('refuses a callback to another site (no open redirect)', async () => {
    const response = await app.request('/api/v1/auth/sign-in/magic-link', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: PUBLIC_URL },
      body: JSON.stringify({
        email: 'x@example.org',
        callbackURL: 'https://evil.example',
      }),
    });
    expect(response.status).toBe(400);
    expect(mailer.links).toHaveLength(0);

    // A link tampered with afterwards is refused as well.
    await requestLink('y@example.org');
    const link = new URL(mailer.links[0]!.url);
    link.searchParams.set('callbackURL', '//evil.example/x');
    const opened = await app.request(`${link.pathname}${link.search}`);
    expect(opened.status).toBe(400);
    expect(opened.headers.get('location')).toBeNull();
  });

  it('rejects requests without a session', async () => {
    expect((await app.request('/api/v1/me')).status).toBe(401);
    expect((await app.request('/api/v1/sync/srs_cards/pull')).status).toBe(401);
    const forged = 'suffa.session_token=forged.value';
    expect(
      (await app.request('/api/v1/me', { headers: { cookie: forged } })).status
    ).toBe(401);
  });

  it('limits sign-in mails per client', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++)
      statuses.push((await requestLink(`r${i}@example.org`)).status);
    expect(statuses.slice(0, 5).every((s) => s === 200)).toBe(true);
    expect(statuses[5]).toBe(429);
    expect(mailer.links).toHaveLength(5);
    // Another client is not affected.
    expect((await requestLink('other@example.org', '198.51.100.9')).status).toBe(200);
  });

  it('signs out: the session stops working at once', async () => {
    await requestLink('bye@example.org');
    const { cookie } = await openLink(mailer.links[0]!.url);
    const out = await app.request('/api/v1/auth/sign-out', {
      method: 'POST',
      headers: { cookie, origin: PUBLIC_URL },
    });
    expect(out.status).toBe(200);
    expect((await app.request('/api/v1/me', { headers: { cookie } })).status).toBe(401);
  });

  it('applies a role change on the next request (no stale role in the cookie)', async () => {
    await requestLink('lehrer@example.org');
    const { cookie } = await openLink(mailer.links[0]!.url);
    const users = () => app.request('/api/v1/admin/users', { headers: { cookie } });
    expect((await users()).status).toBe(403);

    await pool.query(
      "update users set role = 'admin' where email = 'lehrer@example.org'"
    );
    const response = await users();
    expect(response.status).toBe(200);
    const body = (await response.json()) as { users: { email: string; role: string }[] };
    expect(body.users).toEqual([
      expect.objectContaining({ email: 'lehrer@example.org', role: 'admin' }),
    ]);

    await pool.query(
      "update users set role = 'student' where email = 'lehrer@example.org'"
    );
    expect((await users()).status).toBe(403);
  });
});
