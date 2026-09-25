/**
 * AI gateway against a real Postgres (stories 9.3–9.5): seeded routes, admin edits that switch
 * the model at once, quotas per role in the learner's day, budget downgrade and pause, and
 * metering that adds up to what the providers bill. Run with SUFFA_TEST_DATABASE_URL.
 */
import { join } from 'node:path';
import {
  LlmError,
  ModelRouter,
  type LlmProvider,
  type LlmRequest,
  type LlmResult,
  type ProviderId,
} from '@suffa/llm';
import pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AiGateway, AiQuotaError } from '../src/ai/gateway.js';
import { PgAiRepository } from '../src/ai/repository.js';
import { createApp } from '../src/app.js';
import type { AuthResolver } from '../src/auth/resolver.js';
import type { Role } from '../src/authz/policies.js';
import { loadMigrations, migrate } from '../src/migrate.js';

const url = process.env.SUFFA_TEST_DATABASE_URL;
const quiet = { info: () => undefined, warn: () => undefined, error: () => undefined };
const ADMIN = '00000000-0000-4000-8000-0000000000ad';
const AMINA = '00000000-0000-4000-8000-00000000000a';

/** Answers every call with fixed usage; can be told to fail. */
class FakeProvider implements LlmProvider {
  calls: LlmRequest[] = [];
  fail: LlmError | null = null;
  constructor(readonly id: ProviderId) {}
  async complete(request: LlmRequest): Promise<LlmResult> {
    this.calls.push(request);
    if (this.fail) throw this.fail;
    return {
      provider: this.id,
      model: request.model,
      text: `${request.model}: أهلا`,
      stopReason: 'end',
      toolCalls: [],
      usage: {
        inputTokens: 1000,
        outputTokens: 200,
        cacheReadTokens: 4000,
        cacheWriteTokens: 0,
      },
    };
  }
  async *stream(request: LlmRequest) {
    yield { type: 'done' as const, result: await this.complete(request) };
  }
}

describe.skipIf(!url)('AI gateway (Postgres)', () => {
  let pool: pg.Pool;
  let repo: PgAiRepository;
  let anthropic: FakeProvider;
  let openrouter: FakeProvider;
  let router: ModelRouter;
  let gateway: AiGateway;
  let app: ReturnType<typeof createApp>;
  let now: Date;
  let seed: { routes: unknown[]; settings: unknown[] };

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: url, max: 4 });
    await pool.query('drop schema public cascade; create schema public');
    await migrate(
      pool,
      await loadMigrations(join(import.meta.dirname, '..', 'migrations')),
      quiet
    );
    repo = new PgAiRepository(pool);
    seed = {
      routes: (await pool.query('select * from ai_model_routes')).rows,
      settings: (await pool.query('select * from ai_settings')).rows,
    };
  });

  beforeEach(async () => {
    // Routes and settings reference users (updated_by): restore them from the migration's seed.
    await pool.query(
      'truncate users, ai_calls, ai_usage_daily, ai_spend_monthly, ai_model_routes, ai_settings cascade'
    );
    await pool.query(
      'insert into ai_model_routes select * from json_populate_recordset(null::ai_model_routes, $1)',
      [JSON.stringify(seed.routes)]
    );
    await pool.query(
      'insert into ai_settings select * from json_populate_recordset(null::ai_settings, $1)',
      [JSON.stringify(seed.settings)]
    );
    await pool.query(
      `insert into users (id, email, role, time_zone) values
         ($1, 'admin@example.org', 'admin', 'UTC'),
         ($2, 'amina@example.org', 'student', 'Pacific/Auckland')`,
      [ADMIN, AMINA]
    );
    now = new Date('2026-09-25T09:00:00Z');
    anthropic = new FakeProvider('anthropic');
    openrouter = new FakeProvider('openrouter');
    router = new ModelRouter({ providers: { anthropic, openrouter }, source: repo });
    gateway = new AiGateway({ router, repo, log: quiet, now: () => now });
    const auth: AuthResolver = {
      actor: async (h) =>
        h.get('x-test-user') === 'admin'
          ? { id: ADMIN, role: 'admin', secondFactor: true }
          : h.get('x-test-user')
            ? { id: AMINA, role: 'student' }
            : null,
    };
    app = createApp({
      version: 'test',
      expectedRevision: null,
      health: {
        schemaRevision: async () => null,
        queueDepth: async () => ({ waiting: 0, active: 0, failed: 0, deadLetter: 0 }),
      },
      aiAdmin: {
        repo,
        router,
        gateway,
        configured: ['anthropic', 'openrouter'],
        auth,
        log: quiet,
        now: () => now,
      },
    });
  });

  afterAll(async () => {
    await pool?.end();
  });

  const call = (method: string, path: string, body?: unknown, user = 'admin') =>
    app.request(`/api/v1/admin/ai${path}`, {
      method,
      headers: { 'x-test-user': user, 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  const actor = (role: Role, id = role === 'admin' ? ADMIN : AMINA) => ({ id, role });
  const ask = { messages: [{ role: 'user' as const, content: 'مرحبا' }] };

  it('seeds the default routes from the technical spec', async () => {
    const plan = await router.plan('tutor.converse');
    expect(plan.map((r) => `${r.provider}/${r.model}`)).toEqual([
      'anthropic/claude-sonnet-5',
      'anthropic/claude-haiku-4-5',
      'openrouter/meta-llama/llama-3.3-70b-instruct',
    ]);
    expect(plan[0]).toMatchObject({ effort: 'low', premium: true, price: null });
    expect(plan[2]!.price).toEqual({ input: 0.6, output: 0.8 });
    expect(await router.plan('content.author-assist')).toHaveLength(2);
  });

  it('meters a call: cost, tokens incl. cache reads, turns in the learner day, month spend', async () => {
    const result = await gateway.complete(actor('student'), 'tutor.converse', ask);
    // Sonnet 5: 1000 × $2 + 200 × $10 + 4000 × $0.20 per MTok = 4800 µ$
    expect(result.costMicroUsd).toBe(4800);
    const { rows } = await pool.query('select * from ai_calls');
    expect(rows[0]).toMatchObject({
      user_id: AMINA,
      task: 'tutor.converse',
      provider: 'anthropic',
      model: 'claude-sonnet-5',
      outcome: 'ok',
      cache_read_tokens: 4000,
      cost_micro: '4800',
    });
    // 09:00 UTC is 21:00 in Auckland, still 25 September there.
    const daily = await pool.query('select day::text, turns, tokens from ai_usage_daily');
    expect(daily.rows).toEqual([{ day: '2026-09-25', turns: 1, tokens: '5200' }]);
    expect(await repo.monthSpend(now)).toBe(4800);
    const usage = await repo.usageByTask(new Date('2026-09-01T00:00:00Z'));
    expect(usage).toEqual([
      {
        task: 'tutor.converse',
        model: 'claude-sonnet-5',
        calls: 1,
        failed: 0,
        inputTokens: 1000,
        outputTokens: 200,
        cacheReadTokens: 4000,
        costMicro: 4800,
      },
    ]);
  });

  it('stops a learner at the daily quota with a friendly error', async () => {
    await call('PUT', '/settings', {
      monthlyBudgetUsd: 100,
      downgradePercent: 80,
      dailyTurns: { student: 2, teacher: 100, admin: null },
    });
    await gateway.complete(actor('student'), 'tutor.coach', ask);
    await gateway.complete(actor('student'), 'tutor.coach', ask);
    const error = await gateway
      .complete(actor('student'), 'tutor.coach', ask)
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AiQuotaError);
    expect(error).toMatchObject({ used: 2, limit: 2 });
    // Admins have no limit by default.
    await gateway.complete(actor('admin'), 'tutor.coach', ask);
    await gateway.complete(actor('admin'), 'tutor.coach', ask);
    await gateway.complete(actor('admin'), 'tutor.coach', ask);
  });

  it('downgrades at 80 % of the budget and pauses at 100 %', async () => {
    await call('PUT', '/settings', {
      monthlyBudgetUsd: 0.01, // 10 000 µ$
      downgradePercent: 80,
      dailyTurns: { student: 30, teacher: 100, admin: null },
    });
    await gateway.complete(actor('admin'), 'tutor.converse', ask); // 4800 µ$ on Sonnet
    await gateway.complete(actor('admin'), 'tutor.converse', ask); // 9600 µ$ ≥ 80 %
    const cheap = await gateway.complete(actor('admin'), 'tutor.converse', ask);
    expect(cheap.model).toBe('claude-haiku-4-5');
    expect((await gateway.budget()).mode).toBe('exhausted');
    const response = await call('POST', '/try', { task: 'tutor.converse', prompt: 'hi' });
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ error: 'ai_paused' });
    const paused = await pool.query(
      "select count(*)::int as n from ai_calls where outcome = 'paused'"
    );
    expect(paused.rows[0].n).toBe(1);
  });

  it('falls back to the next route and records the failed attempt', async () => {
    anthropic.fail = new LlmError('overloaded', 'anthropic', 'busy', 529);
    const result = await gateway.complete(actor('admin'), 'tutor.converse', ask);
    expect(result.provider).toBe('openrouter');
    const { rows } = await pool.query('select attempts from ai_calls');
    expect(rows[0].attempts.map((a: { outcome: string }) => a.outcome)).toEqual([
      'overloaded',
      'overloaded',
      'ok',
    ]);
  });

  it('records a call that no route could serve', async () => {
    anthropic.fail = new LlmError('server', 'anthropic', 'down', 500);
    const response = await call('POST', '/try', { task: 'tutor.coach', prompt: 'hi' });
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ error: 'ai_unavailable' });
    const { rows } = await pool.query('select outcome, provider, attempts from ai_calls');
    expect(rows).toEqual([
      {
        outcome: 'unavailable',
        provider: null,
        attempts: [
          {
            provider: 'anthropic',
            model: 'claude-haiku-4-5',
            outcome: 'server',
            latencyMs: 0,
          },
        ],
      },
    ]);
    expect(await repo.monthSpend(now)).toBe(0);
  });

  it('lets an admin change the model of a task, live at once and audit-logged', async () => {
    const page = (await (await call('GET', '')).json()) as Record<string, unknown>;
    expect(page).toMatchObject({
      providers: ['anthropic', 'openrouter'],
      budget: { mode: 'normal', spentMicro: 0, budgetMicro: 100_000_000 },
      settings: { dailyTurns: { student: 30, teacher: 100, admin: null } },
    });
    await router.plan('tutor.coach'); // warm the cache
    const put = await call('PUT', '/routes/tutor.coach', {
      routes: [
        {
          provider: 'openrouter',
          model: 'qwen/qwen3-235b-a22b',
          effort: null,
          maxTokens: 600,
          capabilities: ['streaming'],
          premium: false,
          enabled: true,
          price: { input: 0.2, output: 0.6 },
        },
      ],
    });
    expect(put.status).toBe(204);
    const tried = await call('POST', '/try', { task: 'tutor.coach', prompt: 'Plan?' });
    expect(await tried.json()).toMatchObject({
      provider: 'openrouter',
      model: 'qwen/qwen3-235b-a22b',
      // 1000 × 0.2 + 200 × 0.6 + 4000 × 0.2 = 1120 µ$
      costMicroUsd: 1120,
    });
    expect(openrouter.calls[0]!.maxTokens).toBe(400);
    const audit = await pool.query(
      "select actor_id, target_id from audit_log where action = 'ai.routes.replace'"
    );
    expect(audit.rows).toEqual([{ actor_id: ADMIN, target_id: 'tutor.coach' }]);
  });

  it('validates admin input and keeps learners out', async () => {
    expect(
      (await call('PUT', '/routes/tutor.coach', { routes: [{ provider: 'x' }] })).status
    ).toBe(400);
    expect((await call('PUT', '/routes/Bad Task', { routes: [] })).status).toBe(404);
    expect(
      (
        await call('PUT', '/settings', {
          monthlyBudgetUsd: -1,
          downgradePercent: 80,
          dailyTurns: { student: 1, teacher: 1, admin: null },
        })
      ).status
    ).toBe(400);
    expect((await call('POST', '/try', { task: 'tutor.coach' })).status).toBe(400);
    expect((await call('GET', '', undefined, 'amina')).status).toBe(403);
    expect((await call('GET', '', undefined, '')).status).toBe(401);
  });
});
