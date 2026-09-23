import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import {
  DenyAllResolver,
  DevTokenResolver,
  type AuthResolver,
} from '../src/auth/resolver.js';
import {
  newestPerId,
  type PullCursor,
  type SyncRepository,
} from '../src/sync/repository.js';
import type { SyncRecord, SyncTableName } from '../src/sync/schemas.js';

const ALICE = '11111111-1111-4111-8111-111111111111';
const BOB = '22222222-2222-4222-8222-222222222222';
const ALICE_TOKEN = 'a'.repeat(40);
const BOB_TOKEN = 'b'.repeat(40);

/** In-memory repository recording what the routes hand to persistence. */
class FakeRepo implements SyncRepository {
  rows = new Map<string, SyncRecord>();
  async upsert(userId: string, table: SyncTableName, records: SyncRecord[]) {
    for (const r of records) this.rows.set(`${userId}|${table}|${r.id}`, { ...r });
    return records.length;
  }
  async pull(userId: string, table: SyncTableName, cursor: PullCursor) {
    const records = [...this.rows.entries()]
      .filter(([k]) => k.startsWith(`${userId}|${table}|`))
      .map(([, r]) => r)
      .slice(0, cursor.limit);
    return { records, next: null };
  }
}

function setup(
  auth: AuthResolver = new DevTokenResolver(
    new Map([
      [ALICE_TOKEN, ALICE],
      [BOB_TOKEN, BOB],
    ])
  )
) {
  const repo = new FakeRepo();
  const app = createApp({
    version: 'test',
    expectedRevision: null,
    health: { schemaRevision: async () => null },
    sync: { repo, auth, log: { info: () => {}, warn: () => {}, error: () => {} } },
  });
  const call = (path: string, init: RequestInit & { token?: string } = {}) =>
    app.request(`/api/v1/sync${path}`, {
      ...init,
      headers: {
        'content-type': 'application/json',
        ...(init.token ? { authorization: `Bearer ${init.token}` } : {}),
      },
    });
  return { repo, call };
}

const card = (id: string, updated_at = '2026-09-23T10:00:00.000Z') => ({
  id,
  updated_at,
  deleted: false,
  contentRef: 'v-balad',
  kind: 'vocab_ar_de',
  interval: 1,
  ease: 2.5,
  reps: 1,
  lapses: 0,
  due: '2026-09-24T00:00:00.000Z',
  lastReviewed: '2026-09-23T10:00:00.000Z',
  leech: false,
});

describe('sync routes', () => {
  it('rejects unauthenticated requests', async () => {
    const { call } = setup();
    expect((await call('/srs_cards/pull')).status).toBe(401);
    expect((await call('/srs_cards/pull', { token: 'wrong'.repeat(10) })).status).toBe(
      401
    );
  });

  it('is closed by default (DenyAllResolver)', async () => {
    const { call } = setup(new DenyAllResolver());
    expect((await call('/srs_cards/pull', { token: ALICE_TOKEN })).status).toBe(401);
  });

  it('pushes valid records for the authenticated user and ignores a spoofed user_id', async () => {
    const { call, repo } = setup();
    const res = await call('/srs_cards/push', {
      method: 'POST',
      token: ALICE_TOKEN,
      body: JSON.stringify({
        records: [{ ...card('vocab_ar_de:v-balad'), user_id: BOB }],
      }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: 1, applied: 1 });
    const [key, stored] = [...repo.rows.entries()][0]!;
    expect(key).toBe(`${ALICE}|srs_cards|vocab_ar_de:v-balad`);
    expect(stored).not.toHaveProperty('user_id');
  });

  it('keeps users apart', async () => {
    const { call } = setup();
    await call('/srs_cards/push', {
      method: 'POST',
      token: ALICE_TOKEN,
      body: JSON.stringify({ records: [card('c1')] }),
    });
    const bob = (await (await call('/srs_cards/pull', { token: BOB_TOKEN })).json()) as {
      records: unknown[];
    };
    expect(bob.records).toEqual([]);
    const alice = (await (
      await call('/srs_cards/pull', { token: ALICE_TOKEN })
    ).json()) as {
      records: unknown[];
    };
    expect(alice.records).toHaveLength(1);
  });

  it('returns the index and path of an invalid record', async () => {
    const { call } = setup();
    const res = await call('/srs_cards/push', {
      method: 'POST',
      token: ALICE_TOKEN,
      body: JSON.stringify({ records: [card('ok'), { ...card('bad'), ease: 'high' }] }),
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({
      error: 'invalid_record',
      index: 1,
      issues: [{ path: 'ease' }],
    });
  });

  it.each([
    ['unknown table', '/users/push', { records: [] }, 404],
    ['missing records', '/srs_cards/push', { cards: [] }, 400],
    [
      'too many records',
      '/srs_cards/push',
      { records: Array.from({ length: 501 }, (_, i) => card(`c${i}`)) },
      400,
    ],
  ])('rejects %s', async (_label, path, body, status) => {
    const { call } = setup();
    const res = await call(path, {
      method: 'POST',
      token: ALICE_TOKEN,
      body: JSON.stringify(body),
    });
    expect(res.status).toBe(status);
  });

  it('rejects malformed JSON and oversized bodies', async () => {
    const { call } = setup();
    expect(
      (
        await call('/srs_cards/push', {
          method: 'POST',
          token: ALICE_TOKEN,
          body: '{nope',
        })
      ).status
    ).toBe(400);
    const huge = JSON.stringify({
      records: [{ ...card('x'), contentRef: 'x'.repeat(3 * 1024 * 1024) }],
    });
    expect(
      (await call('/srs_cards/push', { method: 'POST', token: ALICE_TOKEN, body: huge }))
        .status
    ).toBe(413);
  });

  it('validates pull parameters', async () => {
    const { call } = setup();
    expect(
      (await call('/srs_cards/pull?since=yesterday', { token: ALICE_TOKEN })).status
    ).toBe(400);
    expect((await call('/srs_cards/pull?afterId=x', { token: ALICE_TOKEN })).status).toBe(
      400
    );
    expect(
      (await call('/srs_cards/pull?limit=5000', { token: ALICE_TOKEN })).status
    ).toBe(400);
    expect(
      (
        await call('/srs_cards/pull?since=2026-09-23T10:00:00.000Z&afterId=c1&limit=10', {
          token: ALICE_TOKEN,
        })
      ).status
    ).toBe(200);
  });
});

describe('newestPerId', () => {
  it('keeps the newest version of each id, comparing instants across offsets', () => {
    const older = card('c1', '2026-09-23T10:00:00.000Z');
    const newer = card('c1', '2026-09-23T12:30:00.000+02:00'); // 10:30Z
    const other = card('c2');
    expect(newestPerId([newer, older, other])).toEqual([newer, other]);
  });
});
