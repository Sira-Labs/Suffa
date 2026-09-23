import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';

function app(revision: () => Promise<string | null>) {
  return createApp({
    version: 'sha-test',
    expectedRevision: '0001_x',
    health: { schemaRevision: revision },
    onProbeError: vi.fn(),
  });
}

describe('http app', () => {
  it('reports ok when the db is reachable and migrated', async () => {
    const res = await app(async () => '0001_x').request('/healthz');
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      status: 'ok',
      db: 'ok',
      schemaRevision: '0001_x',
    });
  });

  it('reports degraded on schema mismatch', async () => {
    const res = await app(async () => null).request('/api/healthz');
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ status: 'degraded' });
  });

  it('reports 503 when the db is unreachable', async () => {
    const res = await app(async () => {
      throw new Error('ECONNREFUSED');
    }).request('/healthz');
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ db: 'unreachable' });
  });

  it('serves version info and JSON 404s', async () => {
    const a = app(async () => '0001_x');
    expect(await (await a.request('/api/version')).json()).toMatchObject({
      name: 'suffa-api',
      version: 'sha-test',
    });
    expect((await a.request('/nope')).status).toBe(404);
  });
});
