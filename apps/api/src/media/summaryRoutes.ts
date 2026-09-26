/**
 * Lesson summaries of a recording, for the class teacher (the summary itself is read with
 * the recording's interactive data, learners only once it is published):
 *
 *   POST /classes/:id/media/:mediaId/summary               → 202 (queued)
 *   PUT  /classes/:id/media/:mediaId/summary  { published } → 204
 */
import { Hono, type Context } from 'hono';
import { z } from 'zod';
import type { AuthResolver } from '../auth/resolver.js';
import { authorize, type ActorEnv, type AuthorizeLog } from '../authz/middleware.js';
import type { Actor, ClassScope } from '../authz/policies.js';
import type { InteractiveRepository } from './interactive.js';
import type { MediaRepository } from './repository.js';
import type { SummaryRepository } from './summary.js';

/** A summary run older than this without progress is taken as lost. */
export const STALE_RUN_MS = 15 * 60 * 1000;
export interface SummaryRouteDeps {
  classes: { scope(classId: string, userId: string): Promise<ClassScope> };
  media: Pick<MediaRepository, 'get'>;
  interactive: Pick<InteractiveRepository, 'transcript' | 'aiEnabled'>;
  summaries: SummaryRepository;
  /** Queues a summary run. */
  enqueue: (mediaId: string) => Promise<void>;
  /** False when no model can serve the summary task. */
  available: () => Promise<boolean>;
  auth: AuthResolver;
  log: AuthorizeLog & { info(obj: object, msg: string): void };
}

const Uuid = z.string().uuid();
const Publish = z.object({ published: z.boolean() }).strict();

export function createSummaryRoutes(deps: SummaryRouteDeps): Hono<ActorEnv> {
  const app = new Hono<ActorEnv>();
  const scope = async (c: Context, actor: Actor) => {
    const id = Uuid.safeParse(c.req.param('id'));
    return id.success ? deps.classes.scope(id.data, actor.id) : { classRole: null };
  };
  const manage = authorize(deps.auth, 'class:manage', deps.log, scope);
  const itemOf = async (c: Context<ActorEnv>) => {
    const mediaId = Uuid.safeParse(c.req.param('mediaId'));
    return mediaId.success ? deps.media.get(c.req.param('id')!, mediaId.data) : null;
  };

  app.post('/classes/:id/media/:mediaId/summary', manage, async (c) => {
    const item = await itemOf(c);
    if (!item || item.status !== 'ready') return c.json({ error: 'not_found' }, 404);
    if (!(await deps.interactive.aiEnabled(item.classId))) {
      return c.json({ error: 'ai_disabled' }, 409);
    }
    const transcript = await deps.interactive.transcript(item.id);
    if (transcript?.status !== 'ready' || transcript.cues.length === 0) {
      return c.json({ error: 'no_transcript' }, 409);
    }
    if (!(await deps.available())) return c.json({ error: 'ai_unavailable' }, 409);
    const current = await deps.summaries.get(item.id);
    const active = current?.status === 'queued' || current?.status === 'running';
    // A run that has not moved for a while lost its worker (restart, crash): queue it again.
    const stale = active && Date.now() - Date.parse(current.updatedAt) > STALE_RUN_MS;
    if (active && !stale) return c.body(null, 202);
    await deps.summaries.setRun(item.id, 'queued', { requestedBy: c.get('actor').id });
    await deps.enqueue(item.id);
    return c.body(null, 202);
  });

  app.put('/classes/:id/media/:mediaId/summary', manage, async (c) => {
    const item = await itemOf(c);
    if (!item) return c.json({ error: 'not_found' }, 404);
    let body: unknown;
    try {
      body = await c.req.json();
    } catch (error) {
      if (!(error instanceof SyntaxError)) throw error;
      body = undefined;
    }
    const parsed = Publish.safeParse(body);
    if (!parsed.success) return c.json({ error: 'invalid_body' }, 400);
    const actor = c.get('actor').id;
    if (!(await deps.summaries.publish(item.id, parsed.data.published, actor))) {
      return c.json({ error: 'no_summary' }, 409);
    }
    deps.log.info(
      { mediaId: item.id, published: parsed.data.published },
      'media.summary_published'
    );
    return c.body(null, 204);
  });

  return app;
}
