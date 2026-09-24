/**
 * Admin area, mounted at /api/v1/admin. Every route needs an admin (authz middleware):
 *
 *   GET   /users      ?q=&cursor=&limit=  → { users, next }   (next: opaque cursor or null)
 *   PATCH /users/:id  { role?, disabled? } → the user            (audit-logged)
 *   GET   /audit      ?before=&limit=     → { entries, next }
 *
 * Admin actions also need a second factor confirmed in this session (authorize() answers
 * 403 second_factor_required otherwise).
 */
import { Hono } from 'hono';
import { z } from 'zod';
import type { AuthResolver } from '../auth/resolver.js';
import { authorize, type ActorEnv, type AuthorizeLog } from '../authz/middleware.js';
import { ROLES } from '../authz/policies.js';
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

  const UserChange = z
    .object({ role: z.enum(ROLES).optional(), disabled: z.boolean().optional() })
    .strict()
    .refine((c) => c.role !== undefined || c.disabled !== undefined, 'nothing to change');

  app.patch(
    '/users/:id',
    authorize(deps.auth, 'admin:users:write', deps.log),
    async (c) => {
      const actor = c.get('actor');
      const id = z.string().uuid().safeParse(c.req.param('id'));
      if (!id.success) return c.json({ error: 'not_found' }, 404);
      let body: unknown;
      try {
        body = await c.req.json();
      } catch {
        return c.json({ error: 'invalid_json' }, 400);
      }
      const change = UserChange.safeParse(body);
      if (!change.success) {
        return c.json(
          { error: 'invalid_body', issues: change.error.issues.map((i) => i.message) },
          400
        );
      }
      // No admin can lock themselves out (or demote the last admin by accident).
      if (id.data === actor.id) return c.json({ error: 'cannot_change_self' }, 400);
      const user = await deps.repo.updateUser(id.data, change.data, {
        actorId: actor.id,
        ipAddress: c.req.header('x-real-ip') ?? null,
      });
      if (!user) return c.json({ error: 'not_found' }, 404);
      return c.json(user);
    }
  );

  const AuditQuery = z.object({
    before: z
      .string()
      .regex(/^\d{1,19}$/)
      .optional(),
    limit: z.coerce.number().int().min(1).max(MAX_LIMIT).default(DEFAULT_LIMIT),
  });

  app.get('/audit', authorize(deps.auth, 'admin:audit:read', deps.log), async (c) => {
    const query = AuditQuery.safeParse(c.req.query());
    if (!query.success) return c.json({ error: 'invalid_query' }, 400);
    const page = await deps.repo.listAudit({
      beforeId: query.data.before ?? null,
      limit: query.data.limit,
    });
    c.header('Cache-Control', 'no-store');
    return c.json(page);
  });

  return app;
}
