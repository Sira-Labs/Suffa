/**
 * Server recompute against a real Postgres (story 5.4): synced records in, XP ledger, quest
 * progress, badges and totals out; cheating fixtures earn nothing; badges are never lost.
 * Run with SUFFA_TEST_DATABASE_URL; the database is wiped.
 */
import { join } from 'node:path';
import pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { AuthResolver } from '../src/auth/resolver.js';
import { recomputeEngagement } from '../src/engagement/recompute.js';
import { PgEngagementRepository } from '../src/engagement/repository.js';
import { loadMigrations, migrate } from '../src/migrate.js';
import { PgSyncRepository } from '../src/sync/repository.js';

const url = process.env.SUFFA_TEST_DATABASE_URL;
const quiet = { info: () => undefined, warn: () => undefined, error: () => undefined };
const AMINA = '00000000-0000-4000-8000-00000000000a';
const NOW = new Date('2026-09-24T18:00:00.000Z');

/** `n` good reviews of new cards on a day, `gapMs` apart. */
function reviews(n: number, start: string, gapMs = 5_000, durationMs = 4_000) {
  return Array.from({ length: n }, (_, i) => {
    const reviewedAt = new Date(Date.parse(start) + i * gapMs).toISOString();
    return {
      id: `${start}-${i}`,
      cardId: `card-${start}-${i}`,
      contentRef: `v${i}`,
      kind: 'vocab_ar_de',
      rating: 'good',
      durationMs,
      scheduledInterval: 1,
      reviewedAt,
      updated_at: reviewedAt,
      deleted: false,
    };
  });
}

describe.skipIf(!url)('Engagement recompute (Postgres)', () => {
  let pool: pg.Pool;
  let repo: PgEngagementRepository;
  let sync: PgSyncRepository;

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: url, max: 4 });
    await pool.query('drop schema public cascade; create schema public');
    await migrate(
      pool,
      await loadMigrations(join(import.meta.dirname, '..', 'migrations')),
      quiet
    );
    repo = new PgEngagementRepository(pool);
    sync = new PgSyncRepository(pool);
  });

  beforeEach(async () => {
    await pool.query('truncate users cascade');
    await pool.query(
      "insert into users (id, email, time_zone) values ($1, 'amina@example.org', 'Europe/Zurich')",
      [AMINA]
    );
  });

  afterAll(async () => {
    await pool?.end();
  });

  it('derives the same XP as the app and stores ledger, quests and state', async () => {
    await sync.upsert(AMINA, 'review_logs', [
      ...reviews(25, '2026-09-23T07:00:00.000Z'),
      ...reviews(25, '2026-09-24T07:00:00.000Z'),
    ]);
    expect(await recomputeEngagement(repo, AMINA, quiet, NOW)).toBe(true);
    const state = await repo.state(AMINA);
    // Per day: 25 × 2 (review) + 25 × 3 (new card) + review quest 30 + learn quest if it
    // counts new words (25). Checked against the ledger instead of hard-coding the quests.
    const ledger = await pool.query(
      'select sum(points)::int as total, count(*)::int as n from xp_ledger where user_id = $1',
      [AMINA]
    );
    expect(state).toMatchObject({
      totalXp: ledger.rows[0].total,
      rulesVersion: 1,
      rejected: 0,
      streak: { current: 2 },
    });
    expect(ledger.rows[0].total).toBeGreaterThanOrEqual(2 * (50 + 75 + 30));
    const quests = await pool.query(
      'select day::text, count(*)::int as n from quest_progress where user_id = $1 group by day order by day',
      [AMINA]
    );
    expect(quests.rows).toEqual([
      { day: '2026-09-23', n: 3 },
      { day: '2026-09-24', n: 3 },
    ]);
    // Recomputing is idempotent.
    await recomputeEngagement(repo, AMINA, quiet, NOW);
    const again = await pool.query(
      'select count(*)::int as n from xp_ledger where user_id = $1',
      [AMINA]
    );
    expect(again.rows[0].n).toBe(ledger.rows[0].n);
  });

  it('gives a cheating flood no more than an honest minute', async () => {
    // 1,000 reviews in 100 seconds, each "answered" in 50 ms.
    await sync.upsert(
      AMINA,
      'review_logs',
      reviews(1000, '2026-09-24T07:00:00.000Z', 100, 50)
    );
    await recomputeEngagement(repo, AMINA, quiet, NOW);
    const state = await repo.state(AMINA);
    expect(state?.rejected).toBe(1000);
    expect(state?.totalXp).toBe(0);
  });

  it('never takes a badge away and serves it over the API', async () => {
    const perfect = {
      id: 'exam-1',
      format: 'vocab_ar_de',
      units: [1],
      score: 10,
      total: 10,
      items: [],
      startedAt: '2026-09-24T07:00:00.000Z',
      finishedAt: '2026-09-24T07:05:00.000Z',
      updated_at: '2026-09-24T07:05:00.000Z',
      deleted: false,
    };
    await sync.upsert(AMINA, 'exam_results', [perfect]);
    await recomputeEngagement(repo, AMINA, quiet, NOW);
    // The exam is deleted later: the badge stays.
    await sync.upsert(AMINA, 'exam_results', [
      { ...perfect, deleted: true, updated_at: '2026-09-24T09:00:00.000Z' },
    ]);
    await recomputeEngagement(repo, AMINA, quiet, NOW);

    const auth: AuthResolver = {
      actor: async (h) => (h.get('x-test-user') ? { id: AMINA, role: 'student' } : null),
    };
    const app = createApp({
      version: 'test',
      expectedRevision: null,
      health: {
        schemaRevision: async () => null,
        queueDepth: async () => ({ waiting: 0, active: 0, failed: 0, deadLetter: 0 }),
      },
      engagement: { repo, auth, log: quiet },
    });
    expect((await app.request('/api/v1/engagement')).status).toBe(401);
    const response = await app.request('/api/v1/engagement', {
      headers: { 'x-test-user': 'amina' },
    });
    const body = (await response.json()) as {
      state: { achievements: { badgeId: string; tier: string }[] };
    };
    expect(body.state.achievements).toEqual([
      expect.objectContaining({ badgeId: 'najm', tier: 'bronze' }),
    ]);
  });

  it('does nothing for an account that is gone', async () => {
    await pool.query('truncate users cascade');
    expect(await recomputeEngagement(repo, AMINA, quiet, NOW)).toBe(false);
  });
});
