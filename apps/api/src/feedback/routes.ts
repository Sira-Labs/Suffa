/**
 * Feedback while testing (staging), mounted at /api/v1:
 *
 *   POST  /feedback                 { kind, message, page, appVersion? } → 201 { id }
 *                                   open to everyone; a signed-in sender is linked
 *   GET   /admin/feedback           ?before=&limit=  → { items, next, open }   (admin + 2FA)
 *   PATCH /admin/feedback/:id       { status: 'new' | 'done' } → 204           (admin + 2FA)
 *
 * Sending is open so testers can report without an account; a per-process rate limit and a
 * small body cap keep it from being flooded. Off (404) when SUFFA_FEEDBACK=off.
 */
import { Hono, type Context } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { z } from 'zod';
import type { AuthResolver } from '../auth/resolver.js';
import { authorize, type ActorEnv, type AuthorizeLog } from '../authz/middleware.js';
import { RateLimiter } from '../observability/tunnel.js';
import { FEEDBACK_KINDS, type FeedbackRepository } from './repository.js';

export interface FeedbackRouteDeps {
  repo: FeedbackRepository;
  auth: AuthResolver;
  log: AuthorizeLog & { info(obj: object, msg: string): void };
  /** Accept new feedback (the admin inbox stays readable either way). */
  enabled: boolean;
  limiter?: RateLimiter;
}

const MAX_BODY_BYTES = 16 * 1024;
const DEFAULT_LIMIT = 50;

const NewFeedback = z
  .object({
    kind: z.enum(FEEDBACK_KINDS),
    message: z.string().trim().min(1).max(4000),
    // A path inside the app, e.g. /units/3?section=2; never a full URL.
    page: z
      .string()
      .trim()
      .min(1)
      .max(300)
      .regex(/^\/[^\s]*$/, 'page must be an app path'),
    appVersion: z.string().trim().max(60).default(''),
  })
  .strict();

const ListQuery = z.object({
  before: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(DEFAULT_LIMIT),
});

const StatusPatch = z.object({ status: z.enum(['new', 'done']) }).strict();

/** The JSON body, or undefined when it is not JSON (answered with 400 by the schema). */
async function jsonBody(c: Context): Promise<unknown> {
  try {
    return await c.req.json();
  } catch (error) {
    if (error instanceof SyntaxError) return undefined;
    throw error;
  }
}

export function createFeedbackRoutes(deps: FeedbackRouteDeps): Hono<ActorEnv> {
  const app = new Hono<ActorEnv>();
  const limiter = deps.limiter ?? new RateLimiter(60, 60_000);

  app.post(
    '/feedback',
    bodyLimit({
      maxSize: MAX_BODY_BYTES,
      onError: (c) => c.json({ error: 'payload_too_large' }, 413),
    }),
    async (c) => {
      if (!deps.enabled) return c.json({ error: 'feedback_disabled' }, 404);
      const parsed = NewFeedback.safeParse(await jsonBody(c));
      if (!parsed.success) return c.json({ error: 'invalid_body' }, 400);
      if (!limiter.tryTake()) return c.json({ error: 'rate_limited' }, 429);
      const actor = await deps.auth.actor(c.req.raw.headers);
      const id = await deps.repo.add({
        userId: actor?.id ?? null,
        kind: parsed.data.kind,
        message: parsed.data.message,
        page: parsed.data.page,
        appVersion: parsed.data.appVersion,
        userAgent: (c.req.header('user-agent') ?? '').slice(0, 300),
      });
      deps.log.info({ feedbackId: id, kind: parsed.data.kind }, 'feedback.received');
      return c.json({ id }, 201);
    }
  );

  app.get(
    '/admin/feedback',
    authorize(deps.auth, 'admin:feedback', deps.log),
    async (c) => {
      const query = ListQuery.safeParse(c.req.query());
      if (!query.success) return c.json({ error: 'invalid_query' }, 400);
      c.header('Cache-Control', 'no-store');
      return c.json(
        await deps.repo.list({
          before: query.data.before ?? null,
          limit: query.data.limit,
        })
      );
    }
  );

  app.patch(
    '/admin/feedback/:id',
    authorize(deps.auth, 'admin:feedback', deps.log),
    async (c) => {
      const id = z.string().uuid().safeParse(c.req.param('id'));
      const body = StatusPatch.safeParse(await jsonBody(c));
      if (!id.success || !body.success) return c.json({ error: 'invalid_body' }, 400);
      return (await deps.repo.setStatus(id.data, body.data.status))
        ? c.body(null, 204)
        : c.json({ error: 'not_found' }, 404);
    }
  );

  return app;
}
