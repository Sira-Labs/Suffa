/**
 * Admin area, mounted at /api/v1/admin. Every route needs an admin (authz middleware):
 *
 *   GET /users   ?q=&cursor=&limit=   → { users, next }   (next: opaque cursor or null)
 */
import { Hono } from 'hono';
import { z } from 'zod';
import type { AuthResolver } from '../auth/resolver.js';
import { authorize, type ActorEnv, type AuthorizeLog } from '../authz/middleware.js';
import type { AdminRepository, UserCursor } from './repository.js';

export interface AdminRouteDeps {
  repo: AdminRepository;
  auth: AuthResolver;
  log: AuthorizeLog;
}

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

const Cursor = z.object({
  createdAt: z.string().datetime({ offset: true }),
  id: z.string().uuid(),
});

const UsersQuery = z.object({
  q: z.string().trim().max(200).optional(),
  cursor: z.string().max(500).optional(),
  limit: z.coerce.number().int().min(1).max(MAX_LIMIT).default(DEFAULT_LIMIT),
});

export function encodeCursor(cursor: UserCursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString('base64url');
}

/** The cursor is opaque to clients; anything that does not decode is a bad request. */
export function decodeCursor(value: string): UserCursor | null {
  try {
    const parsed = Cursor.safeParse(
      JSON.parse(Buffer.from(value, 'base64url').toString('utf8'))
    );
    return parsed.success ? parsed.data : null;
  } catch (error) {
    if (error instanceof SyntaxError) return null;
    throw error;
  }
}

export function createAdminRoutes(deps: AdminRouteDeps): Hono<ActorEnv> {
  const app = new Hono<ActorEnv>();

  app.get('/users', authorize(deps.auth, 'admin:users:read', deps.log), async (c) => {
    const query = UsersQuery.safeParse(c.req.query());
    if (!query.success) {
      return c.json(
        { error: 'invalid_query', issues: query.error.issues.map((i) => i.message) },
        400
      );
    }
    const after = query.data.cursor ? decodeCursor(query.data.cursor) : null;
    if (query.data.cursor && !after) {
      return c.json({ error: 'invalid_query', issues: ['invalid cursor'] }, 400);
    }
    const page = await deps.repo.listUsers({
      search: query.data.q || null,
      after,
      limit: query.data.limit,
    });
    c.header('Cache-Control', 'no-store');
    return c.json({
      users: page.users,
      next: page.next ? encodeCursor(page.next) : null,
    });
  });

  return app;
}
