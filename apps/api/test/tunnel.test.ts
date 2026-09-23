import { describe, expect, it, vi } from 'vitest';
import { createErrorTunnel, parseDsn, RateLimiter } from '../src/observability/tunnel.js';

const WEB_DSN = 'https://webkey123@glitchtip.apps.example.com/2';
const log = { warn: vi.fn() };

function envelope(dsn: string, extra = ''): string {
  return [
    JSON.stringify({ dsn, sent_at: '2026-09-23T12:00:00Z' }),
    JSON.stringify({ type: 'event' }),
    JSON.stringify({ message: 'boom' + extra }),
  ].join('\n');
}

function tunnel(
  opts: { webDsn?: string; fetch?: typeof fetch; limiter?: RateLimiter } = {}
) {
  const upstream = opts.fetch ?? vi.fn(async () => new Response(null, { status: 200 }));
  const app = createErrorTunnel({
    webDsn: 'webDsn' in opts ? opts.webDsn : WEB_DSN,
    fetch: upstream,
    limiter: opts.limiter,
    log,
  });
  const post = (body: string) => app.request('/errors', { method: 'POST', body });
  return { app, upstream, post };
}

describe('parseDsn', () => {
  it('splits a DSN into origin, key and project', () => {
    expect(parseDsn(WEB_DSN)).toEqual({
      origin: 'https://glitchtip.apps.example.com',
      publicKey: 'webkey123',
      projectId: '2',
    });
  });

  it.each(['nope', 'https://host/2', 'https://k@host/abc'])('rejects %s', (dsn) => {
    expect(parseDsn(dsn)).toBeNull();
  });
});

describe('error tunnel', () => {
  it('hands the web DSN to the PWA, uncached', async () => {
    const res = await tunnel().app.request('/client-config');
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(await res.json()).toEqual({ errorDsn: WEB_DSN });
  });

  it('reports null and refuses envelopes when error tracking is off', async () => {
    const { app, post, upstream } = tunnel({ webDsn: undefined });
    expect(await (await app.request('/client-config')).json()).toEqual({
      errorDsn: null,
    });
    expect((await post(envelope(WEB_DSN))).status).toBe(404);
    expect(upstream).not.toHaveBeenCalled();
  });

  it('forwards envelopes for the configured project to GlitchTip', async () => {
    const { post, upstream } = tunnel();
    const body = envelope(WEB_DSN);
    const res = await post(body);
    expect(res.status).toBe(200);
    expect(upstream).toHaveBeenCalledWith(
      'https://glitchtip.apps.example.com/api/2/envelope/?sentry_key=webkey123',
      expect.objectContaining({ method: 'POST', body })
    );
  });

  it.each([
    ['another project', 'https://webkey123@glitchtip.apps.example.com/3'],
    ['another key', 'https://otherkey@glitchtip.apps.example.com/2'],
    ['another host', 'https://webkey123@evil.example.com/2'],
  ])('refuses envelopes for %s', async (_case, dsn) => {
    const { post, upstream } = tunnel();
    expect((await post(envelope(dsn))).status).toBe(403);
    expect(upstream).not.toHaveBeenCalled();
  });

  it('refuses malformed and oversized envelopes', async () => {
    const { post } = tunnel();
    expect((await post('not json\n{}')).status).toBe(400);
    expect((await post(envelope(WEB_DSN, 'x'.repeat(300 * 1024)))).status).toBe(413);
  });

  it('rate-limits floods', async () => {
    const { post, upstream } = tunnel({ limiter: new RateLimiter(2, 60_000) });
    const statuses = [];
    for (let i = 0; i < 3; i += 1) statuses.push((await post(envelope(WEB_DSN))).status);
    expect(statuses).toEqual([200, 200, 429]);
    expect(upstream).toHaveBeenCalledTimes(2);
  });

  it('answers 502 when GlitchTip is unreachable or refuses', async () => {
    const down = tunnel({
      fetch: vi.fn(async () => {
        throw new TypeError('fetch failed');
      }),
    });
    expect((await down.post(envelope(WEB_DSN))).status).toBe(502);
    expect(log.warn).toHaveBeenCalled();
    const refusing = tunnel({
      fetch: vi.fn(async () => new Response(null, { status: 403 })),
    });
    expect((await refusing.post(envelope(WEB_DSN))).status).toBe(502);
  });
});

describe('RateLimiter', () => {
  it('opens a new window after windowMs', () => {
    let now = 0;
    const limiter = new RateLimiter(1, 1000, () => now);
    expect(limiter.tryTake()).toBe(true);
    expect(limiter.tryTake()).toBe(false);
    now = 1000;
    expect(limiter.tryTake()).toBe(true);
  });
});
