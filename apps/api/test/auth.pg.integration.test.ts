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
import { PgAccountRepository } from '../src/account/repository.js';
import { PgPrivacyRepository } from '../src/privacy/repository.js';
import {
  PgSecondFactorRepository,
  SecondFactorService,
} from '../src/account/secondFactor.js';
import { writeAudit } from '../src/audit/log.js';
import { SecretBox } from '../src/security/secretBox.js';
import { base32Decode, stepAt, totpAt } from '../src/security/totp.js';

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
    await pool.query('truncate users, rate_limits, verifications, audit_log cascade');
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
      account: {
        repo: new PgAccountRepository(pool),
        privacy: new PgPrivacyRepository(pool),
        sessions: { actor: (h) => sessions.sessionActor(h) },
        secondFactor: new SecondFactorService(
          new PgSecondFactorRepository(pool),
          new SecretBox('test-secret-0123456789-abcdefghijklmnop', 'totp')
        ),
        audit: ({ actorId, action, ip }) =>
          writeAudit(pool, {
            actorId,
            action,
            targetType: 'user',
            targetId: actorId,
            ipAddress: ip,
          }),
        log: quiet,
      },
      allowedOrigin: PUBLIC_URL,
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
        'x-real-ip': ip,
      },
      body: JSON.stringify({ email, callbackURL: '/settings' }),
    });

  /** Opens the link from the mail; returns the response and the session cookie. */
  const openLink = async (link: string) => {
    const target = new URL(link);
    expect(target.origin).toBe(PUBLIC_URL);
    const response = await app.request(`${target.pathname}${target.search}`, {
      headers: { 'x-real-ip': '203.0.113.7' },
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
    // The session cookie is out of reach for scripts and not sent on cross-site requests.
    const attributes = (response.headers.getSetCookie?.() ?? []).find((c) =>
      c.startsWith('suffa.session_token=')
    );
    expect(attributes).toMatch(/;\s*HttpOnly/i);
    expect(attributes).toMatch(/;\s*SameSite=Lax/i);

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

  it('ignores a client-chosen X-Forwarded-For for rate limits', async () => {
    // Rotating the first hop must not open a fresh budget: only X-Real-IP (set by Caddy) counts.
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) {
      const response = await app.request('/api/v1/auth/sign-in/magic-link', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          origin: PUBLIC_URL,
          'x-real-ip': '192.0.2.44',
          'x-forwarded-for': `10.0.0.${i}`,
        },
        body: JSON.stringify({
          email: `spoof${i}@example.org`,
          callbackURL: '/settings',
        }),
      });
      statuses.push(response.status);
    }
    expect(statuses.at(-1)).toBe(429);
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
    const role = async () =>
      (
        (await (await app.request('/api/v1/me', { headers: { cookie } })).json()) as {
          role: string;
        }
      ).role;
    const users = () => app.request('/api/v1/admin/users', { headers: { cookie } });
    expect(await role()).toBe('student');
    expect(await (await users()).json()).toEqual({ error: 'forbidden' });

    await pool.query(
      "update users set role = 'admin' where email = 'lehrer@example.org'"
    );
    expect(await role()).toBe('admin');
    // Now an admin – the admin area still asks for the second factor, not for the role.
    expect(await (await users()).json()).toEqual({ error: 'second_factor_required' });

    await pool.query(
      "update users set role = 'student' where email = 'lehrer@example.org'"
    );
    expect(await role()).toBe('student');
    expect(await (await users()).json()).toEqual({ error: 'forbidden' });
  });

  /** Signs in once more as the same person, like a second device. */
  const signInDevice = async (email: string, ip: string) => {
    await requestLink(email, ip);
    return (await openLink(mailer.links.at(-1)!.url)).cookie;
  };

  it('lists devices and signs out the others at once (story 3.4)', async () => {
    const laptop = await signInDevice('zwei@example.org', '203.0.113.20');
    const phone = await signInDevice('zwei@example.org', '203.0.113.21');
    const get = (cookie: string, path: string) =>
      app.request(path, { headers: { cookie } });

    const list = await get(laptop, '/api/v1/account/sessions');
    const { sessions } = (await list.json()) as {
      sessions: { id: string; current: boolean }[];
    };
    expect(sessions).toHaveLength(2);
    expect(sessions.filter((s) => s.current)).toHaveLength(1);

    const revoke = await app.request('/api/v1/account/sessions/revoke-others', {
      method: 'POST',
      headers: { cookie: laptop, origin: PUBLIC_URL },
    });
    expect(await revoke.json()).toEqual({ revoked: 1 });
    // The phone's session fails on its very next request; the laptop keeps working.
    expect((await get(phone, '/api/v1/me')).status).toBe(401);
    expect((await get(laptop, '/api/v1/me')).status).toBe(200);
  });

  it("never ends another user's session", async () => {
    const mine = await signInDevice('eins@example.org', '203.0.113.30');
    const theirs = await signInDevice('andere@example.org', '203.0.113.31');
    const { rows } = await pool.query<{ id: string }>(
      "select s.id from sessions s join users u on u.id = s.user_id where u.email = 'andere@example.org'"
    );
    const response = await app.request(`/api/v1/account/sessions/${rows[0]!.id}`, {
      method: 'DELETE',
      headers: { cookie: mine, origin: PUBLIC_URL },
    });
    expect(response.status).toBe(404);
    expect(
      (await app.request('/api/v1/me', { headers: { cookie: theirs } })).status
    ).toBe(200);
  });

  it('stores the time zone and returns it with /me', async () => {
    const cookie = await signInDevice('zeit@example.org', '203.0.113.40');
    const patch = await app.request('/api/v1/account/settings', {
      method: 'PATCH',
      headers: { cookie, origin: PUBLIC_URL, 'content-type': 'application/json' },
      body: JSON.stringify({ timeZone: 'Asia/Riyadh' }),
    });
    expect(patch.status).toBe(204);
    const me = await app.request('/api/v1/me', { headers: { cookie } });
    expect(await me.json()).toMatchObject({
      email: 'zeit@example.org',
      timeZone: 'Asia/Riyadh',
    });
  });

  it('refuses a cross-site write even with a valid session cookie', async () => {
    const cookie = await signInDevice('csrf@example.org', '203.0.113.50');
    const response = await app.request('/api/v1/account/sessions/revoke-others', {
      method: 'POST',
      headers: { cookie, origin: 'https://evil.example' },
    });
    expect(response.status).toBe(403);
  });

  it('keeps Better Auth endpoints outside the allow-list closed', async () => {
    const cookie = await signInDevice('liste@example.org', '203.0.113.60');
    for (const path of ['/get-session', '/list-sessions']) {
      const response = await app.request(`/api/v1/auth${path}`, { headers: { cookie } });
      expect(response.status, path).toBe(404);
    }
  });

  /** Signs in as admin and confirms the second factor; returns the cookie. */
  const signInAdmin = async (email: string, ip: string) => {
    const cookie = await signInDevice(email, ip);
    await pool.query("update users set role = 'admin' where email = $1", [email]);
    const post = (path: string, body?: unknown) =>
      app.request(`/api/v1/account/2fa${path}`, {
        method: 'POST',
        headers: { cookie, origin: PUBLIC_URL, 'content-type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    const { secret } = (await (await post('/setup')).json()) as { secret: string };
    const code = totpAt(base32Decode(secret), stepAt(Date.now()));
    expect((await post('/confirm', { code })).status).toBe(204);
    return { cookie, post, code };
  };

  it('admin area needs the second factor; a used code does not work twice (story 4.2)', async () => {
    const cookie = await signInDevice('chef@example.org', '203.0.113.70');
    await pool.query("update users set role = 'admin' where email = 'chef@example.org'");
    const users = () => app.request('/api/v1/admin/users', { headers: { cookie } });
    const blocked = await users();
    expect(blocked.status).toBe(403);
    expect(await blocked.json()).toEqual({ error: 'second_factor_required' });

    const post = (path: string, body?: unknown) =>
      app.request(`/api/v1/account/2fa${path}`, {
        method: 'POST',
        headers: { cookie, origin: PUBLIC_URL, 'content-type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    const setup = (await (await post('/setup')).json()) as {
      uri: string;
      secret: string;
    };
    expect(setup.uri).toMatch(/^otpauth:\/\/totp\/Suffa%3Achef%40example\.org/);
    const stored = await pool.query('select secret_enc from user_totp');
    expect(JSON.stringify(stored.rows)).not.toContain(setup.secret);

    expect((await post('/confirm', { code: '000000' })).status).toBe(400);
    const code = totpAt(base32Decode(setup.secret), stepAt(Date.now()));
    expect((await post('/confirm', { code })).status).toBe(204);
    expect((await users()).status).toBe(200);
    expect((await post('/confirm', { code })).status).toBe(400);

    const audit = await pool.query('select action from audit_log');
    expect(audit.rows.map((r) => r.action)).toEqual(['account.2fa_enabled']);
  });

  it('disabling a user ends their sessions at once and is audit-logged', async () => {
    const { cookie: admin } = await signInAdmin('leitung@example.org', '203.0.113.80');
    const student = await signInDevice('schueler@example.org', '203.0.113.81');
    const { rows } = await pool.query<{ id: string }>(
      "select id from users where email = 'schueler@example.org'"
    );
    const patch = (body: unknown) =>
      app.request(`/api/v1/admin/users/${rows[0]!.id}`, {
        method: 'PATCH',
        headers: {
          cookie: admin,
          origin: PUBLIC_URL,
          'content-type': 'application/json',
        },
        body: JSON.stringify(body),
      });

    const disabled = await patch({ disabled: true, role: 'teacher' });
    expect(await disabled.json()).toMatchObject({ disabled: true, role: 'teacher' });
    expect(
      (await app.request('/api/v1/me', { headers: { cookie: student } })).status
    ).toBe(401);
    // Signing in again does not help while disabled.
    const again = await signInDevice('schueler@example.org', '203.0.113.82');
    expect((await app.request('/api/v1/me', { headers: { cookie: again } })).status).toBe(
      401
    );

    await patch({ disabled: false });
    const back = await signInDevice('schueler@example.org', '203.0.113.83');
    expect((await app.request('/api/v1/me', { headers: { cookie: back } })).status).toBe(
      200
    );

    const audit = await app.request('/api/v1/admin/audit', {
      headers: { cookie: admin },
    });
    const { entries } = (await audit.json()) as {
      entries: { action: string; actorEmail: string; details: Record<string, unknown> }[];
    };
    expect(entries.map((e) => e.action)).toEqual([
      'user.enabled',
      'user.disabled',
      'user.role_changed',
      'account.2fa_enabled',
    ]);
    expect(entries[1]).toMatchObject({
      actorEmail: 'leitung@example.org',
      details: { endedSessions: 1 },
    });
    expect(entries[2]!.details).toEqual({ from: 'student', to: 'teacher' });
  });

  it('deletes the account only with the own address typed in (story 4.4)', async () => {
    const cookie = await signInDevice('weg@example.org', '203.0.113.90');
    const remove = (confirm: string) =>
      app.request('/api/v1/account', {
        method: 'DELETE',
        headers: { cookie, origin: PUBLIC_URL, 'content-type': 'application/json' },
        body: JSON.stringify({ confirm }),
      });
    const exported = await app.request('/api/v1/account/export', { headers: { cookie } });
    expect(exported.headers.get('content-disposition')).toMatch(
      /attachment; filename="suffa-export-/
    );
    expect(await exported.json()).toMatchObject({
      profile: { email: 'weg@example.org' },
    });

    expect((await remove('someone@example.org')).status).toBe(400);
    expect((await remove(' Weg@Example.org ')).status).toBe(204);
    expect((await app.request('/api/v1/me', { headers: { cookie } })).status).toBe(401);
    const { rows } = await pool.query(
      "select 1 from users where email = 'weg@example.org'"
    );
    expect(rows).toHaveLength(0);
  });
});
