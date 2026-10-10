/**
 * The book follows the author's recording (Medina course), mounted at /api/v1:
 *
 *   GET /book-sync/:course/:book                                      → { course, book, lessons } (public)
 *   PUT /book-sync/:course/:book/:lesson { revision, pages, lines }   → { revision } (content:write)
 *
 * Reading is public, like the course content itself; the answer carries an ETag so the app
 * revalidates cheaply. Saving needs an admin with the second factor and the revision the edit
 * started from (0 for a lesson without sync yet): 409 `stale_revision` when someone was faster.
 */
import { createHash } from 'node:crypto';
import { Hono, type Context } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { z } from 'zod';
import type { AuthResolver } from '../auth/resolver.js';
import { authorize, type ActorEnv, type AuthorizeLog } from '../authz/middleware.js';
import type { BookSyncRepository } from './repository.js';
import { validateBookSync } from './schema.js';

export interface BookSyncRouteDeps {
  repo: BookSyncRepository;
  auth: AuthResolver;
  log: AuthorizeLog;
}

/** 3000 lines of about 90 bytes each, with room to spare. */
const MAX_BODY_BYTES = 512 * 1024;

const BookParams = z.object({
  course: z.string().regex(/^[a-z][a-z0-9-]{0,39}$/),
  book: z.coerce.number().int().min(1).max(9),
});
const LessonParams = BookParams.extend({
  lesson: z.coerce.number().int().min(1).max(99),
});
const SaveBody = z
  .object({
    revision: z.number().int().min(0),
    pages: z.unknown(),
    lines: z.unknown().optional(),
  })
  .strict();

async function jsonBody(c: Context): Promise<unknown> {
  try {
    return await c.req.json();
  } catch (error) {
    if (error instanceof SyntaxError) return undefined;
    throw error;
  }
}

export function createBookSyncRoutes(deps: BookSyncRouteDeps): Hono<ActorEnv> {
  const app = new Hono<ActorEnv>();

  app.get('/book-sync/:course/:book', async (c) => {
    const p = BookParams.safeParse(c.req.param());
    if (!p.success) return c.json({ error: 'not_found' }, 404);
    const lessons = await deps.repo.list(p.data.course, p.data.book);
    const body = JSON.stringify({ course: p.data.course, book: p.data.book, lessons });
    const etag = `"${createHash('sha256').update(body).digest('hex').slice(0, 32)}"`;
    c.header('ETag', etag);
    // Admins may change it any time: caches keep it but ask again before using it.
    c.header('Cache-Control', 'public, no-cache');
    if (c.req.header('if-none-match') === etag) return c.body(null, 304);
    c.header('Content-Type', 'application/json; charset=utf-8');
    return c.body(body);
  });

  app.put(
    '/book-sync/:course/:book/:lesson',
    bodyLimit({
      maxSize: MAX_BODY_BYTES,
      onError: (c) => c.json({ error: 'payload_too_large' }, 413),
    }),
    authorize(deps.auth, 'content:write', deps.log),
    async (c) => {
      const p = LessonParams.safeParse(c.req.param());
      if (!p.success) return c.json({ error: 'not_found' }, 404);
      const body = SaveBody.safeParse(await jsonBody(c));
      if (!body.success) return c.json({ error: 'invalid_body' }, 400);
      const checked = validateBookSync({
        pages: body.data.pages,
        lines: body.data.lines ?? [],
      });
      if (!checked.ok)
        return c.json({ error: 'invalid_sync', issues: checked.issues }, 422);
      const result = await deps.repo.save(
        p.data.course,
        p.data.book,
        p.data.lesson,
        { id: c.get('actor').id, ipAddress: c.req.header('x-real-ip') ?? null },
        body.data.revision,
        checked.data
      );
      if (!result.ok) return c.json({ error: result.reason }, 409);
      return c.json({ revision: result.revision });
    }
  );

  return app;
}
