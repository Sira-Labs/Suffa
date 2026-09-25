/**
 * AI suggestions and chapters of a recording (story 11.4), all for the class teacher:
 *
 *   POST   /classes/:id/media/:mediaId/suggestions           → 202 (queued)
 *   GET    /classes/:id/media/:mediaId/suggestions           → { run, suggestions }
 *   PUT    /classes/:id/media/:mediaId/suggestions/:sid      { decision } → 204
 *   DELETE /classes/:id/media/:mediaId/chapters/:chapterId   → 204
 *
 * Accepting a suggestion creates the chapter or checkpoint; nothing is published without it.
 */
import { Hono, type Context } from 'hono';
import { z } from 'zod';
import type { AuthResolver } from '../auth/resolver.js';
import { authorize, type ActorEnv, type AuthorizeLog } from '../authz/middleware.js';
import type { Actor, ClassScope } from '../authz/policies.js';
import type { InteractiveRepository } from './interactive.js';
import type { MediaRepository } from './repository.js';
import type { SuggestionRepository } from './suggestions.js';

export interface SuggestionRouteDeps {
  classes: { scope(classId: string, userId: string): Promise<ClassScope> };
  media: Pick<MediaRepository, 'get'>;
  interactive: Pick<InteractiveRepository, 'transcript' | 'aiEnabled' | 'addCheckpoint'>;
  suggestions: SuggestionRepository;
  /** Queues a suggestion run. */
  enqueue: (mediaId: string) => Promise<void>;
  /** False when no model can serve the suggestion task. */
  available: () => Promise<boolean>;
  auth: AuthResolver;
  log: AuthorizeLog;
}

const Uuid = z.string().uuid();
const Decision = z.object({ decision: z.enum(['accept', 'dismiss']) }).strict();

export function createSuggestionRoutes(deps: SuggestionRouteDeps): Hono<ActorEnv> {
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

  app.post('/classes/:id/media/:mediaId/suggestions', manage, async (c) => {
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
    await deps.suggestions.setRun(item.id, 'queued', { requestedBy: c.get('actor').id });
    await deps.enqueue(item.id);
    return c.body(null, 202);
  });

  app.get('/classes/:id/media/:mediaId/suggestions', manage, async (c) => {
    const item = await itemOf(c);
    if (!item) return c.json({ error: 'not_found' }, 404);
    const [run, suggestions] = await Promise.all([
      deps.suggestions.run(item.id),
      deps.suggestions.pending(item.id),
    ]);
    c.header('Cache-Control', 'no-store');
    return c.json({
      run: run
        ? { status: run.status, error: run.error, updatedAt: run.updatedAt }
        : null,
      suggestions,
    });
  });

  app.put('/classes/:id/media/:mediaId/suggestions/:sid', manage, async (c) => {
    const item = await itemOf(c);
    const sid = Uuid.safeParse(c.req.param('sid'));
    if (!item || !sid.success) return c.json({ error: 'not_found' }, 404);
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      body = undefined;
    }
    const parsed = Decision.safeParse(body);
    if (!parsed.success) return c.json({ error: 'invalid_body' }, 400);
    const actor = c.get('actor').id;
    const decided = await deps.suggestions.decide(
      item.id,
      sid.data,
      parsed.data.decision === 'accept' ? 'accepted' : 'dismissed',
      actor
    );
    if (!decided) return c.json({ error: 'not_found' }, 404);
    if (parsed.data.decision === 'accept') {
      if (decided.kind === 'chapter') {
        await deps.suggestions.addChapter(
          item.id,
          decided.atSec,
          decided.data.title,
          actor
        );
      } else {
        await deps.interactive.addCheckpoint(item.id, decided.atSec, decided.data, actor);
      }
    }
    return c.body(null, 204);
  });

  app.delete('/classes/:id/media/:mediaId/chapters/:chapterId', manage, async (c) => {
    const item = await itemOf(c);
    const chapter = Uuid.safeParse(c.req.param('chapterId'));
    if (!item || !chapter.success) return c.json({ error: 'not_found' }, 404);
    return (await deps.suggestions.removeChapter(item.id, chapter.data))
      ? c.body(null, 204)
      : c.json({ error: 'not_found' }, 404);
  });

  return app;
}
