import { describe, expect, it } from 'vitest';
import type { AccountRepository, DeviceSession } from '../src/account/repository.js';
import { createAccountRoutes, isTimeZone } from '../src/account/routes.js';

const USER = '55555555-5555-4555-8555-555555555555';
const session = (id: string): DeviceSession => ({
  id,
  createdAt: '2026-09-24T10:00:00.000Z',
  lastActiveAt: '2026-09-24T11:00:00.000Z',
  expiresAt: '2026-10-24T10:00:00.000Z',
  userAgent: 'Mozilla/5.0',
});

function setup() {
  const calls: string[] = [];
  const repo: AccountRepository = {
    listSessions: async () => [session('this-device'), session('phone')],
    revokeSession: async (userId, id) => {
      calls.push(`revoke ${userId} ${id}`);
      return id === 'phone';
    },
    revokeOtherSessions: async (userId, keep) => {
      calls.push(`revoke-others ${userId} keep ${keep}`);
      return 1;
    },
    setTimeZone: async (userId, tz) => {
      calls.push(`tz ${userId} ${tz}`);
    },
  };
  const app = createAccountRoutes({
    repo,
    sessions: {
      actor: async () => ({
        id: USER,
        role: 'student',
        sessionId: 'this-device',
        email: 'amina@example.org',
      }),
    },
    log: { info: () => {}, warn: () => {} },
  });
  return { app, calls };
}

describe('account routes', () => {
  it('lists sessions and marks this device, without tokens', async () => {
    const { app } = setup();
    const response = await app.request('/sessions');
    const body = (await response.json()) as { sessions: Record<string, unknown>[] };
    expect(body.sessions.map((s) => [s.id, s.current])).toEqual([
      ['this-device', true],
      ['phone', false],
    ]);
    expect(JSON.stringify(body)).not.toMatch(/token/i);
    expect(response.headers.get('cache-control')).toBe('no-store');
  });

  it('ends all other sessions of the signed-in user only', async () => {
    const { app, calls } = setup();
    const response = await app.request('/sessions/revoke-others', { method: 'POST' });
    expect(await response.json()).toEqual({ revoked: 1 });
    expect(calls).toEqual([`revoke-others ${USER} keep this-device`]);
  });

  it('ends one own session and answers 404 for anything else', async () => {
    const { app, calls } = setup();
    expect((await app.request('/sessions/phone', { method: 'DELETE' })).status).toBe(204);
    expect(
      (await app.request('/sessions/someone-else', { method: 'DELETE' })).status
    ).toBe(404);
    expect(calls).toEqual([`revoke ${USER} phone`, `revoke ${USER} someone-else`]);
  });

  it('stores a valid time zone and refuses unknown ones or extra fields', async () => {
    const { app, calls } = setup();
    const patch = (body: unknown) =>
      app.request('/settings', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
    expect((await patch({ timeZone: 'Europe/Zurich' })).status).toBe(204);
    expect((await patch({ timeZone: null })).status).toBe(204);
    expect((await patch({ timeZone: 'Mars/Olympus' })).status).toBe(400);
    expect((await patch({ timeZone: "UTC'; drop table users;--" })).status).toBe(400);
    expect((await patch({ role: 'admin' })).status).toBe(400);
    expect(calls).toEqual([`tz ${USER} Europe/Zurich`, `tz ${USER} null`]);
  });
});

describe('isTimeZone', () => {
  it('knows IANA zones and UTC', () => {
    for (const tz of [
      'UTC',
      'Europe/Berlin',
      'America/Argentina/Buenos_Aires',
      'Etc/GMT+2',
    ])
      expect(isTimeZone(tz), tz).toBe(true);
  });
  it('rejects anything else', () => {
    for (const tz of ['', 'Europe/', '../etc/passwd', 'Nowhere/City', 'Europe Berlin'])
      expect(isTimeZone(tz), tz).toBe(false);
  });
});
