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
import {
  SYNC_SCHEMAS,
  SYNC_TABLES,
  type SyncRecord,
  type SyncTableName,
} from '../src/sync/schemas.js';

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
      practice_progress: {
        id: '3:write:w-3-1',
        updated_at: '2026-09-23T10:00:00.000Z',
        deleted: false,
        unit: 3,
        skill: 'write',
        itemId: 'w-3-1',
        practisedAt: '2026-09-23T10:00:00.000Z',
      },
      unit_enrollments: {
        id: 'b1-u3',
        updated_at: '2026-09-23T10:00:00.000Z',
        deleted: false,
        book: 1,
        unit: 3,
        pace: 'normal',
        startedAt: '2026-09-20T08:00:00.000Z',
        dueAt: '2026-10-04T21:59:59.999Z',
        extended: false,
      },
      daily_checkins: {
        id: '2026-09-23',
        updated_at: '2026-09-23T10:00:00.000Z',
        deleted: false,
        wordId: 'v-balad',
        checkedAt: '2026-09-23T07:30:00.000Z',
      },
      discover_progress: {
        id: 'yt/abc123',
        updated_at: '2026-09-23T10:00:00.000Z',
        deleted: false,
        startedAt: null,
        openedAt: '2026-09-23T10:00:00.000Z',
        pinned: true,
        positionSec: 83.5,
        playlistIndex: null,
        durationSec: 600,
      },
      media_progress: {
        id: 'b1/unit01/lesson01/01',
        updated_at: '2026-09-23T10:00:00.000Z',
        deleted: false,
        source: 'publisher-audio',
        ref: 'https://old.arabicforall.net/audio/1.mp3',
        lessonKey: 'b1/u1/l1',
        durationSec: 95.2,
        listenedSec: 95.2,
        completedAt: '2026-09-23T10:00:00.000Z',
      },
    };
    // Every synced table must be covered, so a new table cannot ship without a column check.
    expect(Object.keys(records).sort()).toEqual([...SYNC_TABLES].sort());
    for (const [table, record] of Object.entries(records)) {
      // The wire schema must accept what the app sends, too.
      expect(SYNC_SCHEMAS[table as SyncTableName].safeParse(record).success, table).toBe(
        true
      );
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

  const practice = (id: string, at: string): SyncRecord => ({
    id,
    updated_at: at,
    deleted: false,
    unit: 1,
    skill: 'read',
    itemId: id,
    practisedAt: at,
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

  it('never lets a merely created card replace a reviewed one', async () => {
    const reviewed = {
      ...card('c2', '2026-09-23T10:00:00.000Z', 5),
      lastReviewed: '2026-09-23T10:00:00.000Z',
    };
    await repo.upsert(ALICE, 'srs_cards', [reviewed]);
    // Another device created the same card later (fresh updated_at) but never reviewed it.
    expect(
      await repo.upsert(ALICE, 'srs_cards', [card('c2', '2026-09-24T08:00:00.000Z', 0)])
    ).toBe(0);
    // A later review wins even with an older updated_at; an equal review falls back to LWW.
    const later = {
      ...card('c2', '2026-09-23T09:00:00.000Z', 6),
      lastReviewed: '2026-09-23T12:00:00.000Z',
    };
    expect(await repo.upsert(ALICE, 'srs_cards', [later])).toBe(1);
    const leech = { ...later, leech: true, updated_at: '2026-09-23T13:00:00.000Z' };
    expect(await repo.upsert(ALICE, 'srs_cards', [leech])).toBe(1);
    const { records } = await repo.pull(ALICE, 'srs_cards', {
      since: null,
      afterId: null,
      limit: 10,
    });
    expect(records[0]).toMatchObject({ reps: 6, leech: true });
  });

  it('never lets an unfinished listen replace a finished one', async () => {
    const track = (
      updated_at: string,
      listenedSec: number,
      completedAt: string | null
    ) => ({
      id: 't1',
      updated_at,
      deleted: false,
      source: 'publisher-audio',
      ref: 'https://old.arabicforall.net/audio/1.mp3',
      lessonKey: 'b1/u1/l1',
      durationSec: 100,
      listenedSec,
      completedAt,
    });
    await repo.upsert(ALICE, 'media_progress', [
      track('2026-09-23T10:00:00.000Z', 100, '2026-09-23T10:00:00.000Z'),
    ]);
    // Another device started the track again later: newer, but not finished.
    expect(
      await repo.upsert(ALICE, 'media_progress', [
        track('2026-09-24T10:00:00.000Z', 20, null),
      ])
    ).toBe(0);
    await repo.upsert(ALICE, 'media_progress', [
      { ...track('2026-09-24T10:00:00.000Z', 30, null), id: 't2' },
    ]);
    // Unfinished against unfinished: more listening wins even when older.
    expect(
      await repo.upsert(ALICE, 'media_progress', [
        { ...track('2026-09-23T09:00:00.000Z', 60, null), id: 't2' },
      ])
    ).toBe(1);
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

  it('pulls only what the server stored after the watermark, and tombstones', async () => {
    await repo.upsert(ALICE, 'srs_cards', [card('old', '2026-09-23T08:00:00.000Z')]);
    const first = await repo.pull(ALICE, 'srs_cards', {
      since: null,
      afterId: null,
      limit: 10,
    });
    expect(first.watermark).not.toBeNull();
    await repo.upsert(ALICE, 'srs_cards', [
      { ...card('gone', '2026-09-23T12:00:00.000Z'), deleted: true },
    ]);
    const page = await repo.pull(ALICE, 'srs_cards', {
      since: first.watermark,
      afterId: null,
      limit: 10,
    });
    expect(page.records.map((r) => [r.id, r.deleted])).toEqual([['gone', true]]);
  });

  it('pulls data another device uploads late, however old its updated_at', async () => {
    // Phone syncs today and remembers the watermark.
    await repo.upsert(ALICE, 'practice_progress', [
      practice('p-today', '2026-09-24T14:00:00.000Z'),
    ]);
    const phone = await repo.pull(ALICE, 'practice_progress', {
      since: null,
      afterId: null,
      limit: 10,
    });
    // Desktop uploads what it practised last week, for the first time.
    await repo.upsert(ALICE, 'practice_progress', [
      practice('d-last-week', '2026-09-17T09:00:00.000Z'),
    ]);
    const next = await repo.pull(ALICE, 'practice_progress', {
      since: phone.watermark,
      afterId: null,
      limit: 10,
    });
    expect(next.records.map((r) => r.id)).toEqual(['d-last-week']);
    expect(next.records[0]).not.toHaveProperty('synced_at');
  });
});
