import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { sameOriginOnly } from '../src/http/sameOrigin.js';

const ORIGIN = 'https://suffa.example.org';

function app() {
  const hono = new Hono();
  hono.use('*', sameOriginOnly(ORIGIN));
  hono.all('/x', (c) => c.text('ok'));
  return hono;
}

const call = (method: string, headers: Record<string, string> = {}) =>
  app().request('/x', { method, headers });

describe('sameOriginOnly', () => {
  it('lets reads through from anywhere', async () => {
    expect((await call('GET', { origin: 'https://evil.example' })).status).toBe(200);
  });

  it('accepts writes from the app itself and from non-browser clients', async () => {
    expect((await call('POST', { origin: ORIGIN })).status).toBe(200);
    expect((await call('POST', { 'sec-fetch-site': 'same-origin' })).status).toBe(200);
    expect((await call('DELETE')).status).toBe(200);
  });

  it('refuses writes a browser sends from another site', async () => {
    expect((await call('POST', { origin: 'https://evil.example' })).status).toBe(403);
    expect((await call('PATCH', { origin: 'null' })).status).toBe(403);
    expect((await call('DELETE', { 'sec-fetch-site': 'cross-site' })).status).toBe(403);
    expect((await call('POST', { 'sec-fetch-site': 'same-site' })).status).toBe(403);
  });

  it('accepts every configured origin while the app moves domain', async () => {
    const hono = new Hono();
    hono.use('*', sameOriginOnly([ORIGIN, 'https://old.example.org']));
    hono.all('/x', (c) => c.text('ok'));
    const post = (origin: string) =>
      hono.request('/x', { method: 'POST', headers: { origin } });
    expect((await post('https://old.example.org')).status).toBe(200);
    expect((await post(ORIGIN)).status).toBe(200);
    expect((await post('https://evil.example')).status).toBe(403);
  });
});
