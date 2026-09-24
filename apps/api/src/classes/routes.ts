/**
 * Classes, mounted at /api/v1 (story 4.3, ADR-0009):
 *
 *   GET    /classes                              → { classes }            (class:join)
 *   POST   /classes                  { name }    → the class              (class:create)
 *   POST   /classes/:id/invite                   → { url, expiresAt }     (class:manage)
 *   GET    /classes/:id/members                  → { members }            (class:manage)
 *   POST   /classes/:id/members/:userId/approve  → 204                    (class:manage)
 *   DELETE /classes/:id/members/:userId          → 204                    (class:manage)
 *   GET    /invites/:token                       → { className, teacherName } (class:join)
 *   POST   /invites/:token/join                  → { classId, className, status }
 *
 * class:manage is scoped: the actor's class role comes from the database (only the class's
 * teachers, or admins), never from the request.
 */
import { Hono, type Context } from 'hono';
import { z } from 'zod';
import type { AuthResolver } from '../auth/resolver.js';
import { authorize, type ActorEnv, type AuthorizeLog } from '../authz/middleware.js';
import type { Actor as PolicyActor } from '../authz/policies.js';
import type { ClassRepository } from './repository.js';

export interface ClassRouteDeps {
  repo: ClassRepository;
  auth: AuthResolver;
  log: AuthorizeLog;
  /** Public URL of the app; invite links point to `${publicUrl}/join/<token>`. */
  publicUrl: string;
}

const Uuid = z.string().uuid();
const Token = z.string().regex(/^[A-Za-z0-9_-]{20,64}$/);
const NewClass = z.object({ name: z.string().trim().min(1).max(80) }).strict();

const clientIp = (c: Context) => c.req.header('x-real-ip') ?? null;

export function createClassRoutes(deps: ClassRouteDeps): Hono<ActorEnv> {
  const app = new Hono<ActorEnv>();

  /** The actor's role in the class named by :id (none for a malformed id). */
  const classScope = async (c: Context, actor: PolicyActor) => {
    const id = Uuid.safeParse(c.req.param('id'));
    return id.success ? deps.repo.scope(id.data, actor.id) : { classRole: null };
  };
  const manage = authorize(deps.auth, 'class:manage', deps.log, classScope);
  const join = authorize(deps.auth, 'class:join', deps.log);

  app.get('/classes', join, async (c) => {
    c.header('Cache-Control', 'no-store');
    return c.json({ classes: await deps.repo.listFor(c.get('actor').id) });
  });

  app.post('/classes', authorize(deps.auth, 'class:create', deps.log), async (c) => {
    const body = await readJson(c);
    const parsed = NewClass.safeParse(body);
    if (!parsed.success) return c.json({ error: 'invalid_body' }, 400);
    const actor = { id: c.get('actor').id, ip: clientIp(c) };
    return c.json(await deps.repo.create(actor, parsed.data.name), 201);
  });

  app.post('/classes/:id/invite', manage, async (c) => {
    const actor = { id: c.get('actor').id, ip: clientIp(c) };
    const invite = await deps.repo.createInvite(actor, c.req.param('id'));
    c.header('Cache-Control', 'no-store');
    return c.json({
      url: `${deps.publicUrl}/join/${invite.token}`,
      expiresAt: invite.expiresAt,
    });
  });

  app.get('/classes/:id/members', manage, async (c) => {
    c.header('Cache-Control', 'no-store');
    return c.json({ members: await deps.repo.members(c.req.param('id')) });
  });

  app.post('/classes/:id/members/:userId/approve', manage, async (c) => {
    const userId = Uuid.safeParse(c.req.param('userId'));
    if (!userId.success) return c.json({ error: 'not_found' }, 404);
    const actor = { id: c.get('actor').id, ip: clientIp(c) };
    const done = await deps.repo.approve(actor, c.req.param('id'), userId.data);
    return done ? c.body(null, 204) : c.json({ error: 'not_found' }, 404);
  });

  app.delete('/classes/:id/members/:userId', manage, async (c) => {
    const userId = Uuid.safeParse(c.req.param('userId'));
    if (!userId.success) return c.json({ error: 'not_found' }, 404);
    const actor = { id: c.get('actor').id, ip: clientIp(c) };
    const done = await deps.repo.remove(actor, c.req.param('id'), userId.data);
    return done ? c.body(null, 204) : c.json({ error: 'not_found' }, 404);
  });

  app.get('/invites/:token', join, async (c) => {
    const token = Token.safeParse(c.req.param('token'));
    const preview = token.success ? await deps.repo.preview(token.data) : null;
    if (!preview) return c.json({ error: 'invalid_invite' }, 404);
    return c.json({ className: preview.className, teacherName: preview.teacherName });
  });

  app.post('/invites/:token/join', join, async (c) => {
    const token = Token.safeParse(c.req.param('token'));
    if (!token.success) return c.json({ error: 'invalid_invite' }, 404);
    const actor = { id: c.get('actor').id, ip: clientIp(c) };
    const result = await deps.repo.join(actor, token.data);
    if (!result.ok) return c.json({ error: result.reason }, 404);
    return c.json({
      classId: result.classId,
      className: result.className,
      status: result.status,
    });
  });

  return app;
}

async function readJson(c: Context): Promise<unknown> {
  try {
    return await c.req.json();
  } catch {
    return null;
  }
}
