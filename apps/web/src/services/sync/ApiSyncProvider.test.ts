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
const ME = { id: 'u-1', email: 'amina@example.org', name: null, role: 'student' };

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

  it('pulls page by page until the API has no next cursor', async () => {
    const { provider, calls } = fakeApi((path) => {
      if (!path.includes('afterId')) {
        return json({
          records: [{ id: 'a', updated_at: '2026-09-24T10:00:00.000Z', deleted: false }],
          next: { since: '2026-09-24T10:00:00.000Z', afterId: 'a' },
        });
      }
      return json({
        records: [{ id: 'b', updated_at: '2026-09-24T10:00:00.000Z', deleted: false }],
        next: null,
      });
    });
    const result = await provider.pull('srs_cards', '2026-09-01T00:00:00.000Z');
    expect(result.ok && result.value.map((r) => r.id)).toEqual(['a', 'b']);
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
      path === '/api/v1/me' && signedIn ? json(ME) : json({ error: 'unauthorized' }, 401)
    );
    await provider.refresh();
    expect(provider.getAuthState().status).toBe('signed-in');
    signedIn = false;
    const result = await provider.pull('srs_cards', null);
    expect(result).toMatchObject({ ok: false, error: { code: 'not-authenticated' } });
    expect(provider.getAuthState().status).toBe('signed-out');
  });
});
