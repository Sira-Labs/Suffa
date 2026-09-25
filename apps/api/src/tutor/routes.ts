/**
 * al-Muʿallim API (Sprint 10), every route for signed-in users (`tutor:use`), each learner only
 * ever reaches their own conversations:
 *
 *   GET    /tutor                          → { available, tutorLanguage, conversations }
 *   PUT    /tutor/settings                 { tutorLanguage: de|en } → 204
 *   POST   /tutor/turn                     { conversationId?, message, context? } → SSE events
 *   GET    /tutor/conversations/:id        → { conversation, messages }
 *   DELETE /tutor/conversations/:id        → 204
 *   PUT    /tutor/messages/:id/rating      { rating: 1 | -1 | null } → 204
 */
import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import type pg from 'pg';
import { z } from 'zod';
import type { AuthResolver } from '../auth/resolver.js';
import { authorize, type ActorEnv, type AuthorizeLog } from '../authz/middleware.js';
import type { TutorRepository } from './repository.js';
import type { TutorService } from './service.js';
import { HISTORY_MESSAGES } from './service.js';

/** Where the tutor language lives (users.tutor_language). */
export interface TutorSettingsStore {
  language(userId: string): Promise<'de' | 'en'>;
  setLanguage(userId: string, language: 'de' | 'en'): Promise<void>;
}

export class PgTutorSettings implements TutorSettingsStore {
  constructor(private readonly pool: pg.Pool) {}

  async language(userId: string) {
    const { rows } = await this.pool.query(
      'select tutor_language from users where id = $1',
      [userId]
    );
    return rows[0]?.tutor_language === 'en' ? 'en' : 'de';
  }

  async setLanguage(userId: string, language: 'de' | 'en') {
    await this.pool.query('update users set tutor_language = $2 where id = $1', [
      userId,
      language,
    ]);
  }
}

export interface TutorRouteDeps {
  service: TutorService;
  repo: TutorRepository;
  settings: TutorSettingsStore;
  /** False when no provider can serve the tutor task (no key configured). */
  available: () => Promise<boolean>;
  auth: AuthResolver;
  log: AuthorizeLog;
}

const Turn = z
  .object({
    conversationId: z.string().uuid().optional(),
    message: z.string().trim().min(1).max(2000),
    context: z
      .object({
        unit: z.number().int().min(1).max(100).optional(),
        mediaId: z.string().uuid().optional(),
        atSec: z
          .number()
          .min(0)
          .max(24 * 3600)
          .optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

const Rating = z
  .object({ rating: z.union([z.literal(1), z.literal(-1), z.null()]) })
  .strict();
const Settings = z.object({ tutorLanguage: z.enum(['de', 'en']) }).strict();
const Id = z.string().uuid();

async function json(c: { req: { json(): Promise<unknown> } }): Promise<unknown> {
  try {
    return await c.req.json();
  } catch {
    return undefined;
  }
}

export function createTutorRoutes(deps: TutorRouteDeps): Hono<ActorEnv> {
  const app = new Hono<ActorEnv>();
  const use = authorize(deps.auth, 'tutor:use', deps.log);

  app.get('/tutor', use, async (c) => {
    const actor = c.get('actor');
    const [available, tutorLanguage, conversations] = await Promise.all([
      deps.available(),
      deps.settings.language(actor.id),
      deps.repo.list(actor.id, 30),
    ]);
    c.header('Cache-Control', 'no-store');
    return c.json({ available, tutorLanguage, conversations });
  });

  app.put('/tutor/settings', use, async (c) => {
    const parsed = Settings.safeParse(await json(c));
    if (!parsed.success) return c.json({ error: 'invalid_body' }, 400);
    await deps.settings.setLanguage(c.get('actor').id, parsed.data.tutorLanguage);
    return c.body(null, 204);
  });

  app.post('/tutor/turn', use, async (c) => {
    const parsed = Turn.safeParse(await json(c));
    if (!parsed.success) {
      return c.json(
        { error: 'invalid_body', issues: parsed.error.issues.map((i) => i.message) },
        400
      );
    }
    const actor = c.get('actor');
    // Proxies must not buffer the stream (Caddy flushes SSE; nginx honours this header).
    c.header('X-Accel-Buffering', 'no');
    return streamSSE(c, async (stream) => {
      const abort = new AbortController();
      stream.onAbort(() => abort.abort());
      for await (const event of deps.service.turn(actor, parsed.data, abort.signal)) {
        await stream.writeSSE({ event: event.type, data: JSON.stringify(event) });
      }
    });
  });

  app.get('/tutor/conversations/:id', use, async (c) => {
    const id = Id.safeParse(c.req.param('id'));
    if (!id.success) return c.json({ error: 'not_found' }, 404);
    const conversation = await deps.repo.get(id.data, c.get('actor').id);
    if (!conversation) return c.json({ error: 'not_found' }, 404);
    c.header('Cache-Control', 'no-store');
    return c.json({
      conversation,
      messages: await deps.repo.messages(conversation.id, HISTORY_MESSAGES * 4),
    });
  });

  app.delete('/tutor/conversations/:id', use, async (c) => {
    const id = Id.safeParse(c.req.param('id'));
    if (!id.success || !(await deps.repo.remove(id.data, c.get('actor').id))) {
      return c.json({ error: 'not_found' }, 404);
    }
    return c.body(null, 204);
  });

  app.put('/tutor/messages/:id/rating', use, async (c) => {
    const id = Id.safeParse(c.req.param('id'));
    const parsed = Rating.safeParse(await json(c));
    if (!id.success) return c.json({ error: 'not_found' }, 404);
    if (!parsed.success) return c.json({ error: 'invalid_body' }, 400);
    const ok = await deps.repo.rate(id.data, c.get('actor').id, parsed.data.rating);
    return ok ? c.body(null, 204) : c.json({ error: 'not_found' }, 404);
  });

  return app;
}
