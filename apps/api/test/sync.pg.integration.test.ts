/**
 * Integration tests against a real Postgres (the SQL cannot be verified with fakes).
 * Run with SUFFA_TEST_DATABASE_URL=postgres://… ; skipped otherwise. The database is
 * wiped, so never point this at real data.
 */
import { join } from 'node:path';
import pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { loadMigrations, migrate } from '../src/migrate.js';
import { PgSyncRepository } from '../src/sync/repository.js';
import type { SyncRecord } from '../src/sync/schemas.js';

const url = process.env.SUFFA_TEST_DATABASE_URL;
const ALICE = '11111111-1111-4111-8111-111111111111';
const BOB = '22222222-2222-4222-8222-222222222222';
const quiet = { info: () => undefined };

describe.skipIf(!url)('PgSyncRepository (Postgres)', () => {
  let pool: pg.Pool;
  let repo: PgSyncRepository;

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: url, max: 4 });
    await pool.query('drop schema public cascade; create schema public');
    await migrate(
      pool,
      await loadMigrations(join(import.meta.dirname, '..', 'migrations')),
      quiet
    );
    repo = new PgSyncRepository(pool);
  });

  beforeEach(async () => {
    await pool.query('truncate users cascade');
    await pool.query('insert into users (id) values ($1), ($2)', [ALICE, BOB]);
  });

  afterAll(async () => {
    await pool?.end();
  });

  const card = (id: string, updated_at: string, reps = 1): SyncRecord => ({
    id,
    updated_at,
    deleted: false,
    contentRef: 'v-balad',
    kind: 'vocab_ar_de',
    interval: 6,
    ease: 2.36,
    reps,
    lapses: 0,
    due: '2026-09-29T00:00:00.000Z',
    lastReviewed: null,
    leech: false,
  });

  it('round-trips every table with ISO timestamps, nulls and json', async () => {
    const records: Record<string, SyncRecord> = {
      srs_cards: card('vocab_ar_de:v-balad', '2026-09-23T10:00:00.000Z'),
      review_logs: {
        id: 'log-1',
        updated_at: '2026-09-23T10:00:00.000Z',
        deleted: false,
        cardId: 'vocab_ar_de:v-balad',
        contentRef: 'v-balad',
        kind: 'vocab_ar_de',
        rating: 'good',
        durationMs: 4200,
        scheduledInterval: 6,
        reviewedAt: '2026-09-23T10:00:00.000Z',
      },
      exam_results: {
        id: 'exam-1',
        updated_at: '2026-09-23T10:00:00.000Z',
        deleted: false,
        format: 'mixed_chapter',
        units: [1, 2],
        score: 8,
        total: 10,
        items: [{ contentRef: 'v-balad', correct: true }],
        startedAt: '2026-09-23T09:50:00.000Z',
        finishedAt: '2026-09-23T10:00:00.000Z',
      },
      settings: {
        id: 'user-settings',
        updated_at: '2026-09-23T10:00:00.000Z',
        deleted: false,
        key: 'user-settings',
        tashkilLevel: 'partial',
        theme: 'light',
        arabicFontScale: 1.25,
        dailyGoal: 30,
        showTransliteration: false,
        dialectNotes: true,
      },
      user_vocab: {
        id: 'uv-1',
        updated_at: '2026-09-23T10:00:00.000Z',
        deleted: false,
        ar: 'مَدِينَة',
        tr: 'madīna',
        de: 'Stadt',
        wurzel: 'م-د-ن',
        wazn: null,
        plural: 'مُدُن',
        einheit: 2,
        hinweis: null,
      },
    };
    for (const [table, record] of Object.entries(records)) {
      expect(await repo.upsert(ALICE, table as never, [record])).toBe(1);
      const page = await repo.pull(ALICE, table as never, {
        since: null,
        afterId: null,
        limit: 10,
      });
      expect(page.records).toEqual([record]);
      expect(page.next).toBeNull();
    }
  });

  it('is last-write-wins: newer replaces, older is ignored', async () => {
    await repo.upsert(ALICE, 'srs_cards', [card('c1', '2026-09-23T10:00:00.000Z', 1)]);
    expect(
      await repo.upsert(ALICE, 'srs_cards', [card('c1', '2026-09-23T11:00:00.000Z', 2)])
    ).toBe(1);
    expect(
      await repo.upsert(ALICE, 'srs_cards', [card('c1', '2026-09-23T09:00:00.000Z', 99)])
    ).toBe(0);
    const { records } = await repo.pull(ALICE, 'srs_cards', {
      since: null,
      afterId: null,
      limit: 10,
    });
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ reps: 2, updated_at: '2026-09-23T11:00:00.000Z' });
  });

  it('keeps identical card ids of different users apart', async () => {
    await repo.upsert(ALICE, 'srs_cards', [
      card('vocab_ar_de:v-balad', '2026-09-23T10:00:00.000Z', 1),
    ]);
    await repo.upsert(BOB, 'srs_cards', [
      card('vocab_ar_de:v-balad', '2026-09-23T10:00:00.000Z', 7),
    ]);
    const alice = await repo.pull(ALICE, 'srs_cards', {
      since: null,
      afterId: null,
      limit: 10,
    });
    const bob = await repo.pull(BOB, 'srs_cards', {
      since: null,
      afterId: null,
      limit: 10,
    });
    expect(alice.records.map((r) => r.reps)).toEqual([1]);
    expect(bob.records.map((r) => r.reps)).toEqual([7]);
  });

  it('paginates without skipping records that share a timestamp', async () => {
    const same = '2026-09-23T10:00:00.000Z';
    await repo.upsert(ALICE, 'srs_cards', [
      ...['a', 'b', 'c', 'd', 'e'].map((id) => card(id, same)),
      card('f', '2026-09-23T10:00:01.000Z'),
    ]);
    const seen: string[] = [];
    let cursor = {
      since: null as string | null,
      afterId: null as string | null,
      limit: 2,
    };
    for (let guard = 0; guard < 10; guard++) {
      const page = await repo.pull(ALICE, 'srs_cards', cursor);
      seen.push(...page.records.map((r) => r.id));
      if (!page.next) break;
      cursor = { ...page.next, limit: 2 };
    }
    expect(seen).toEqual(['a', 'b', 'c', 'd', 'e', 'f']);
  });

  it('pulls only changes after `since` and syncs tombstones', async () => {
    await repo.upsert(ALICE, 'srs_cards', [card('old', '2026-09-23T08:00:00.000Z')]);
    await repo.upsert(ALICE, 'srs_cards', [
      { ...card('gone', '2026-09-23T12:00:00.000Z'), deleted: true },
    ]);
    const page = await repo.pull(ALICE, 'srs_cards', {
      since: '2026-09-23T09:00:00.000Z',
      afterId: null,
      limit: 10,
    });
    expect(page.records.map((r) => [r.id, r.deleted])).toEqual([['gone', true]]);
  });
});
