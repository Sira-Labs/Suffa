/**
 * Teacher review of AI grades (story 11.2), scoped to the teacher's own class:
 *
 *   GET  /classes/:id/grades?status=open|reviewed   → { grades }       (class:progress:read)
 *   PUT  /classes/:id/grades/:gradeId               verdict → 204      (class:manage)
 *   GET  /classes/:id/grades/export                 → eval cases JSON  (class:progress:read)
 */
import { Hono, type Context } from 'hono';
import { z } from 'zod';
import type { AuthResolver } from '../auth/resolver.js';
import { authorize, type ActorEnv, type AuthorizeLog } from '../authz/middleware.js';
import type { Actor } from '../authz/policies.js';
import type { ClassRepository } from '../classes/repository.js';
import type { ReviewRepository } from './review.js';

export interface ReviewRouteDeps {
  classes: Pick<ClassRepository, 'scope'>;
  reviews: ReviewRepository;
  auth: AuthResolver;
  log: AuthorizeLog;
}

const Uuid = z.string().uuid();
const Verdict = z.discriminatedUnion('decision', [
  z.object({ decision: z.literal('confirm') }).strict(),
  z
    .object({
      decision: z.literal('override'),
      score: z.number().int().min(0).max(100),
      comment: z.string().trim().max(1000),
      corrected: z.string().trim().max(6000).nullable().default(null),
    })
    .strict(),
]);

export function createReviewRoutes(deps: ReviewRouteDeps): Hono<ActorEnv> {
  const app = new Hono<ActorEnv>();
  const classScope = async (c: Context, actor: Actor) => {
    const id = Uuid.safeParse(c.req.param('id'));
    return id.success ? deps.classes.scope(id.data, actor.id) : { classRole: null };
  };
  const read = authorize(deps.auth, 'class:progress:read', deps.log, classScope);
  const manage = authorize(deps.auth, 'class:manage', deps.log, classScope);

  app.get('/classes/:id/grades', read, async (c) => {
    const status = c.req.query('status') === 'reviewed' ? 'reviewed' : 'open';
    c.header('Cache-Control', 'no-store');
    return c.json({ grades: await deps.reviews.queue(c.req.param('id'), status, 50) });
  });

  app.get('/classes/:id/grades/export', read, async (c) => {
    c.header('Cache-Control', 'no-store');
    c.header('Content-Disposition', 'attachment; filename="suffa-grading-evals.json"');
    return c.json({ cases: await deps.reviews.evalCases(c.req.param('id')) });
  });

  app.put('/classes/:id/grades/:gradeId', manage, async (c) => {
    const gradeId = Uuid.safeParse(c.req.param('gradeId'));
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      body = undefined;
    }
    const verdict = Verdict.safeParse(body);
    if (!gradeId.success) return c.json({ error: 'not_found' }, 404);
    if (!verdict.success) return c.json({ error: 'invalid_body' }, 400);
    const ok = await deps.reviews.review(
      c.req.param('id'),
      gradeId.data,
      c.get('actor').id,
      verdict.data
    );
    return ok ? c.body(null, 204) : c.json({ error: 'not_found' }, 404);
  });

  return app;
}
