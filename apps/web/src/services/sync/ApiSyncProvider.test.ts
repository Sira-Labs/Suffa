import { describe, expect, it, vi } from 'vitest';
import { ApiSyncProvider, PUSH_BATCH, SIGN_IN_RETURN_PATH } from './ApiSyncProvider';

type Handler = (path: string, init?: RequestInit) => Response | Promise<Response>;

function fakeApi(handler: Handler) {
  const calls: { path: string; init?: RequestInit }[] = [];
  const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input);
    calls.push({ path, init });
    return handler(path, init);
  }) as unknown as typeof fetch;
  return { provider: new ApiSyncProvider('', fetchImpl), calls };
}

const json = (body: unknown, status = 200) => Response.json(body, { status });
const ME = {
  id: 'u-1',
  email: 'amina@example.org',
  name: null,
  role: 'student',
  timeZone: null,
};

describe('ApiSyncProvider', () => {
  it('reports itself unavailable when the server has no sign-in', async () => {
    const { provider } = fakeApi(() => json({ error: 'not_found' }, 404));
    expect(provider.isConfigured()).toBe(true);
    await provider.refresh();
    expect(provider.isConfigured()).toBe(false);
    expect(provider.getAuthState()).toEqual({ status: 'signed-out' });
  });

  it('treats an HTML answer (SPA fallback, dev server) as no sign-in', async () => {
    const { provider } = fakeApi(
      () => new Response('<!doctype html>', { headers: { 'content-type': 'text/html' } })
    );
    await provider.refresh();
    expect(provider.isConfigured()).toBe(false);
  });

  it('knows the signed-in user from /me and tells listeners', async () => {
    const { provider } = fakeApi(() => json(ME));
    const listener = vi.fn();
    provider.onAuthChange(listener);
    await vi.waitFor(() =>
      expect(listener).toHaveBeenCalledWith({
        status: 'signed-in',
        user: { id: 'u-1', email: 'amina@example.org' },
      })
    );
    expect(provider.currentUser()?.role).toBe('student');
  });

  it('asks for a magic link that returns to the settings page', async () => {
    const { provider, calls } = fakeApi(() => json({ status: true }));
    expect(await provider.signInWithEmail(' amina@example.org ')).toEqual({
      ok: true,
      value: undefined,
    });
    expect(calls[0]!.path).toBe('/api/v1/auth/sign-in/magic-link');
    expect(JSON.parse(String(calls[0]!.init!.body))).toEqual({
      email: 'amina@example.org',
      callbackURL: SIGN_IN_RETURN_PATH,
    });
    expect(calls[0]!.init!.credentials).toBe('same-origin');
  });

  it('explains rate limits and bad addresses in German', async () => {
    const { provider } = fakeApi(() => json({}, 429));
    const limited = await provider.signInWithEmail('a@b.de');
    expect(limited).toMatchObject({ ok: false, error: { code: 'rate-limited' } });
    const invalid = await provider.signInWithEmail('kein-at');
    expect(invalid).toMatchObject({ ok: false, error: { code: 'invalid-email' } });
  });

  it('signs in with the code from the mail and explains each refusal', async () => {
    const answers = [
      json({ ok: true }),
      json({
        id: 'u1',
        email: 'amina@example.org',
        name: null,
        role: 'student',
        timeZone: 'UTC',
      }),
    ];
    const { provider, calls } = fakeApi(() => answers.shift() ?? json({}, 500));
    expect(await provider.signInWithCode(' amina@example.org ', '042 917')).toEqual({
      ok: true,
      value: undefined,
    });
    expect(calls[0]!.path).toBe('/api/v1/auth/sign-in/email-otp');
    expect(JSON.parse(String(calls[0]!.init!.body))).toEqual({
      email: 'amina@example.org',
      otp: '042917',
    });
    // Signed in right away: the session is asked for at once.
    expect(provider.getAuthState()).toMatchObject({ status: 'signed-in' });

    const refused = (status: number, body: object) =>
      fakeApi(() => json(body, status)).provider.signInWithCode('a@b.de', '123456');
    expect(await refused(400, { code: 'INVALID_OTP' })).toMatchObject({
      error: { code: 'invalid-code' },
    });
    expect(await refused(400, { code: 'OTP_EXPIRED' })).toMatchObject({
      error: { code: 'code-expired' },
    });
    expect(await refused(403, { code: 'TOO_MANY_ATTEMPTS' })).toMatchObject({
      error: { code: 'too-many-attempts' },
    });
    expect(await provider.signInWithCode('a@b.de', '12ab')).toMatchObject({
      error: { code: 'invalid-code' },
    });
  });

  it('pulls page by page until the API has no next cursor', async () => {
    const { provider, calls } = fakeApi((path) => {
      if (!path.includes('afterId')) {
        return json({
          records: [{ id: 'a', updated_at: '2026-09-24T10:00:00.000Z', deleted: false }],
          next: { since: '2026-10-01T10:00:00.000Z', afterId: 'a' },
          watermark: '2026-10-01T10:00:00.000Z',
        });
      }
      return json({
        records: [{ id: 'b', updated_at: '2026-09-24T10:00:00.000Z', deleted: false }],
        next: null,
        watermark: '2026-10-01T10:00:05.000Z',
      });
    });
    const result = await provider.pull('srs_cards', '2026-09-01T00:00:00.000Z');
    expect(result.ok && result.value.records.map((r) => r.id)).toEqual(['a', 'b']);
    // The watermark is the server's time of the last record, not a record timestamp.
    expect(result.ok && result.value.watermark).toBe('2026-10-01T10:00:05.000Z');
    expect(calls[0]!.path).toBe(
      '/api/v1/sync/srs_cards/pull?since=2026-09-01T00%3A00%3A00.000Z'
    );
    expect(calls[1]!.path).toContain('afterId=a');
  });

  it('pushes in batches the API accepts', async () => {
    const { provider, calls } = fakeApi(() => json({ received: 1, applied: 1 }));
    const records = Array.from({ length: PUSH_BATCH + 1 }, (_, i) => ({
      id: `r${i}`,
      updated_at: '2026-09-24T10:00:00.000Z',
      deleted: false,
    }));
    expect((await provider.push('review_logs', records)).ok).toBe(true);
    expect(calls).toHaveLength(2);
    expect(JSON.parse(String(calls[1]!.init!.body)).records).toHaveLength(1);
  });

  it('drops to signed-out when the session has ended', async () => {
    let signedIn = true;
    const { provider } = fakeApi((path) =>
      path === '/api/v1/account/settings'
        ? new Response(null, { status: 204 })
        : path === '/api/v1/me' && signedIn
          ? json(ME)
          : json({ error: 'unauthorized' }, 401)
    );
    await provider.refresh();
    expect(provider.getAuthState().status).toBe('signed-in');
    signedIn = false;
    const result = await provider.pull('srs_cards', null);
    expect(result).toMatchObject({ ok: false, error: { code: 'not-authenticated' } });
    expect(provider.getAuthState().status).toBe('signed-out');
  });

  it('adopts the device time zone for an account without one', async () => {
    const { provider, calls } = fakeApi((path) =>
      path === '/api/v1/me' ? json(ME) : new Response(null, { status: 204 })
    );
    await provider.refresh();
    await vi.waitFor(() =>
      expect(calls.some((c) => c.path === '/api/v1/account/settings')).toBe(true)
    );
    const patch = calls.find((c) => c.path === '/api/v1/account/settings')!;
    expect(JSON.parse(String(patch.init?.body))).toEqual({
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    });
    expect(provider.currentUser()?.timeZone).toBe(
      Intl.DateTimeFormat().resolvedOptions().timeZone
    );
  });

  it('reads the server engagement state', async () => {
    const state = { totalXp: 120, computedAt: '2026-09-24T10:00:00.000Z' };
    const { provider } = fakeApi((path) =>
      path === '/api/v1/engagement'
        ? json({ state })
        : json({ error: 'unauthorized' }, 401)
    );
    expect(await provider.engagementState()).toEqual({ ok: true, value: state });
    const offline = new ApiSyncProvider('', (async () => {
      throw new TypeError('offline');
    }) as unknown as typeof fetch);
    expect((await offline.engagementState()).ok).toBe(false);
  });

  it('lists devices and signs out the others', async () => {
    const { provider, calls } = fakeApi((path, init) => {
      if (path === '/api/v1/account/sessions') {
        return json({
          sessions: [
            { id: 's1', current: true },
            { id: 's2', current: false },
          ],
        });
      }
      if (init?.method === 'POST') return json({ revoked: 1 });
      return new Response(null, { status: 204 });
    });
    const sessions = await provider.listSessions();
    expect(sessions.ok && sessions.value.map((s) => s.id)).toEqual(['s1', 's2']);
    expect(await provider.revokeOtherSessions()).toEqual({ ok: true, value: 1 });
    expect((await provider.revokeSession('a/b')).ok).toBe(true);
    expect(calls.at(-1)!.path).toBe('/api/v1/account/sessions/a%2Fb');
    expect(calls.at(-1)!.init!.method).toBe('DELETE');
  });

  it('saves the time zone', async () => {
    const { provider, calls } = fakeApi(() => new Response(null, { status: 204 }));
    expect((await provider.setTimeZone('Europe/Zurich')).ok).toBe(true);
    expect(calls[0]!.init!.method).toBe('PATCH');
    expect(JSON.parse(String(calls[0]!.init!.body))).toEqual({
      timeZone: 'Europe/Zurich',
    });
  });
});

describe('ApiSyncProvider during a server outage', () => {
  it('keeps sign-in configured and the last state when the API answers 502', async () => {
    let status = 200;
    const { provider } = fakeApi(() =>
      status === 200 ? json(ME) : new Response('Bad Gateway', { status })
    );
    await provider.refresh();
    expect(provider.getAuthState().status).toBe('signed-in');
    status = 502;
    await provider.refresh();
    expect(provider.isConfigured()).toBe(true);
    expect(provider.isServerDown()).toBe(true);
    expect(provider.getAuthState().status).toBe('signed-in');
    status = 200;
    await provider.refresh();
    expect(provider.isServerDown()).toBe(false);
  });
});
