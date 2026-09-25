/**
 * Admin AI page API (story 9.5), mounted at /api/v1/admin/ai. Admin + second factor:
 *
 *   GET   /                → { providers, routes, settings, budget, usage }   (last 30 days)
 *   PUT   /routes/:task    { routes: [...] } → 204   (order = fallback order; audit-logged)
 *   PUT   /settings        { monthlyBudgetUsd, downgradePercent, dailyTurns } → 204
 *   POST  /try             { task, prompt } → the routed answer with usage and cost
 */
import { CAPABILITIES, type ModelRouter, type ProviderId } from '@suffa/llm';
import { Hono } from 'hono';
import { z } from 'zod';
import type { AuthResolver } from '../auth/resolver.js';
import { authorize, type ActorEnv, type AuthorizeLog } from '../authz/middleware.js';
import { aiErrorResponse } from './errors.js';
import type { AiGateway } from './gateway.js';
import type { AiRepository } from './repository.js';

export interface AiAdminDeps {
  repo: AiRepository;
  gateway: AiGateway;
  router: ModelRouter;
  /** Providers with a key on this server. */
  configured: ProviderId[];
  auth: AuthResolver;
  log: AuthorizeLog;
  now?: () => Date;
}

const TASK = /^[a-z]+(\.[a-z-]+)+$/;
const PROVIDERS = ['anthropic', 'openrouter', 'huggingface'] as const;

const Route = z
  .object({
    provider: z.enum(PROVIDERS),
    model: z
      .string()
      .trim()
      .min(1)
      .max(200)
      .regex(/^[\w.:/-]+$/, 'invalid model id'),
    effort: z.enum(['low', 'medium', 'high', 'xhigh', 'max']).nullable(),
    maxTokens: z.number().int().min(1).max(128_000),
    capabilities: z.array(z.enum(CAPABILITIES as [string, ...string[]])).max(4),
    premium: z.boolean(),
    enabled: z.boolean(),
    price: z
      .object({ input: z.number().min(0).max(1000), output: z.number().min(0).max(1000) })
      .nullable(),
  })
  .strict();

const Routes = z.object({ routes: z.array(Route).max(10) }).strict();

const Turns = z.number().int().min(0).max(10_000).nullable();
const Settings = z
  .object({
    monthlyBudgetUsd: z.number().min(0).max(100_000),
    downgradePercent: z.number().int().min(1).max(100),
    dailyTurns: z.object({ student: Turns, teacher: Turns, admin: Turns }).strict(),
  })
  .strict();

const Try = z
  .object({
    task: z.string().regex(TASK),
    prompt: z.string().trim().min(1).max(2000),
  })
  .strict();

async function body(c: { req: { json(): Promise<unknown> } }): Promise<unknown> {
  try {
    return await c.req.json();
  } catch {
    return undefined;
  }
}

export function createAiAdminRoutes(deps: AiAdminDeps): Hono<ActorEnv> {
  const app = new Hono<ActorEnv>();
  const now = deps.now ?? (() => new Date());
  const read = authorize(deps.auth, 'admin:ai:read', deps.log);
  const write = authorize(deps.auth, 'admin:ai:write', deps.log);

  app.get('/', read, async (c) => {
    const since = new Date(now().getTime() - 30 * 24 * 60 * 60 * 1000);
    const [routes, settings, budget, usage] = await Promise.all([
      deps.repo.load(),
      deps.repo.settings(),
      deps.gateway.budget(),
      deps.repo.usageByTask(since),
    ]);
    c.header('Cache-Control', 'no-store');
    return c.json({ providers: deps.configured, routes, settings, budget, usage });
  });

  app.put('/routes/:task', write, async (c) => {
    const task = c.req.param('task');
    if (!TASK.test(task)) return c.json({ error: 'not_found' }, 404);
    const parsed = Routes.safeParse(await body(c));
    if (!parsed.success) {
      return c.json(
        { error: 'invalid_body', issues: parsed.error.issues.map((i) => i.message) },
        400
      );
    }
    await deps.repo.replaceRoutes(
      task,
      parsed.data.routes.map((r) => ({
        ...r,
        capabilities: r.capabilities as (typeof CAPABILITIES)[number][],
      })),
      { actorId: c.get('actor').id, ipAddress: c.req.header('x-real-ip') ?? null }
    );
    // This instance switches at once; other instances within the router's cache TTL (60 s).
    deps.router.invalidate();
    return c.body(null, 204);
  });

  app.put('/settings', write, async (c) => {
    const parsed = Settings.safeParse(await body(c));
    if (!parsed.success) {
      return c.json(
        { error: 'invalid_body', issues: parsed.error.issues.map((i) => i.message) },
        400
      );
    }
    await deps.repo.updateSettings(
      {
        monthlyBudgetMicro: Math.round(parsed.data.monthlyBudgetUsd * 1_000_000),
        downgradePercent: parsed.data.downgradePercent,
        dailyTurns: parsed.data.dailyTurns,
      },
      { actorId: c.get('actor').id, ipAddress: c.req.header('x-real-ip') ?? null }
    );
    return c.body(null, 204);
  });

  app.post('/try', write, async (c) => {
    const parsed = Try.safeParse(await body(c));
    if (!parsed.success) return c.json({ error: 'invalid_body' }, 400);
    try {
      const result = await deps.gateway.complete(c.get('actor'), parsed.data.task, {
        messages: [{ role: 'user', content: parsed.data.prompt }],
        maxTokens: 400,
      });
      return c.json({
        text: result.text,
        provider: result.provider,
        model: result.model,
        stopReason: result.stopReason,
        usage: result.usage,
        costMicroUsd: result.costMicroUsd,
        latencyMs: result.latencyMs,
        attempts: result.attempts,
      });
    } catch (error) {
      const mapped = aiErrorResponse(error);
      if (!mapped) throw error;
      return c.json(mapped.body, mapped.status);
    }
  });

  return app;
}
