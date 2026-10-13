/**
 * Live lessons (ADR-0026), mounted at /api/v1:
 *
 *   GET    /classes/:id/live                    → { enabled, sessions }            (class:read)
 *   POST   /classes/:id/live                    { title, startsAt, durationMinutes } → 201
 *                                                                                   (class:manage)
 *   POST   /classes/:id/live/:session/start     → the session, now live            (class:manage)
 *   POST   /classes/:id/live/:session/end       → the session, ended; room closed  (class:manage)
 *   DELETE /classes/:id/live/:session           → 204, a planned session removed   (class:manage)
 *   POST   /classes/:id/live/:session/join      → { url, token, role }             (class:read)
 *   POST   /classes/:id/live/:session/floor     { identity, allowed } → 204        (class:manage)
 *
 * Only active members of the class get a token, and only while the session is live. The
 * teacher's token may publish and moderate; a learner's may only listen, chat and raise a
 * hand until the teacher gives them the floor; only active learners of the class can be given
 * the floor (`not_in_room` for anyone else, so a teacher's own rights are never replaced).
 * Without a LiveKit server (`rooms` undefined) sessions are listed as disabled and nobody can
 * start or join one.
 */
import { Hono, type Context } from 'hono';
import { z } from 'zod';
import type { AuthResolver } from '../auth/resolver.js';
import { authorize, type ActorEnv, type AuthorizeLog } from '../authz/middleware.js';
import type { Actor as PolicyActor } from '../authz/policies.js';
import type { ClassRepository } from '../classes/repository.js';
import {
  OVERRUN_MINUTES,
  type LiveActionResult,
  type LiveSessionRepository,
} from './repository.js';
import type { LiveRooms } from './rooms.js';

export interface LiveRouteDeps {
  classes: Pick<ClassRepository, 'scope'>;
  sessions: LiveSessionRepository;
  /** The LiveKit server; undefined while live lessons are not set up. */
  rooms: LiveRooms | undefined;
  auth: AuthResolver;
  log: AuthorizeLog & { warn(obj: object, msg: string): void };
  now?: () => Date;
}

const Uuid = z.string().uuid();
const DAY_MS = 24 * 60 * 60 * 1000;

const CreateBody = z
  .object({
    title: z.string().trim().min(1).max(120),
    startsAt: z.string().datetime({ offset: true }),
    durationMinutes: z.number().int().min(10).max(240),
  })
  .strict();
const FloorBody = z.object({ identity: Uuid, allowed: z.boolean() }).strict();

const STATUS: Record<Exclude<LiveActionResult, { ok: true }>['reason'], 404 | 409> = {
  not_found: 404,
  wrong_state: 409,
  already_live: 409,
};

/** The LiveKit room of a session. */
export const roomName = (sessionId: string) => `live-${sessionId}`;

export function createLiveRoutes(deps: LiveRouteDeps): Hono<ActorEnv> {
  const app = new Hono<ActorEnv>();
  const now = deps.now ?? (() => new Date());
  const classScope = async (c: Context, actor: PolicyActor) => {
    const id = Uuid.safeParse(c.req.param('id'));
    return id.success ? deps.classes.scope(id.data, actor.id) : { classRole: null };
  };
  const manage = authorize(deps.auth, 'class:manage', deps.log, classScope);
  const read = authorize(deps.auth, 'class:read', deps.log, classScope);

  const actorOf = (c: Context<ActorEnv>) => ({
    id: c.get('actor').id,
    ip: c.req.header('x-real-ip') ?? null,
  });
  const sessionParam = (c: Context) => Uuid.safeParse(c.req.param('session'));
  const isTeacher = async (c: Context<ActorEnv>) => {
    const actor = c.get('actor');
    if (actor.role === 'admin') return true;
    const scope = await deps.classes.scope(c.req.param('id')!, actor.id);
    return scope.classRole === 'teacher';
  };
  const unavailable = (c: Context) => c.json({ error: 'live_unavailable' }, 503);
  const fail = (c: Context, result: Exclude<LiveActionResult, { ok: true }>) =>
    c.json({ error: result.reason }, STATUS[result.reason]);

  app.get('/classes/:id/live', read, async (c) => {
    c.header('Cache-Control', 'no-store');
    const sessions = await deps.sessions.list(c.req.param('id'));
    return c.json({ enabled: deps.rooms !== undefined, sessions });
  });

  app.post('/classes/:id/live', manage, async (c) => {
    const parsed = CreateBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: 'invalid_body' }, 400);
    const startsAt = new Date(parsed.data.startsAt);
    const offset = startsAt.getTime() - now().getTime();
    // Planned from earlier today (a session starting right now) up to a year ahead.
    if (offset < -DAY_MS || offset > 366 * DAY_MS) {
      return c.json({ error: 'invalid_start' }, 400);
    }
    const session = await deps.sessions.create(c.req.param('id'), actorOf(c), {
      title: parsed.data.title,
      startsAt,
      durationMinutes: parsed.data.durationMinutes,
    });
    return c.json({ session }, 201);
  });

  app.post('/classes/:id/live/:session/start', manage, async (c) => {
    if (!deps.rooms) return unavailable(c);
    const id = sessionParam(c);
    if (!id.success) return c.json({ error: 'not_found' }, 404);
    const result = await deps.sessions.start(c.req.param('id'), id.data, actorOf(c));
    return result.ok ? c.json({ session: result.session }) : fail(c, result);
  });

  app.post('/classes/:id/live/:session/end', manage, async (c) => {
    const id = sessionParam(c);
    if (!id.success) return c.json({ error: 'not_found' }, 404);
    const result = await deps.sessions.end(c.req.param('id'), id.data, actorOf(c));
    if (!result.ok) return fail(c, result);
    try {
      await deps.rooms?.close(roomName(id.data));
    } catch (error) {
      // The session is ended either way; the room empties when its tokens can no longer join.
      deps.log.warn({ err: String(error), session: id.data }, 'live.close_failed');
    }
    return c.json({ session: result.session });
  });

  app.delete('/classes/:id/live/:session', manage, async (c) => {
    const id = sessionParam(c);
    if (!id.success) return c.json({ error: 'not_found' }, 404);
    const result = await deps.sessions.cancel(c.req.param('id'), id.data, actorOf(c));
    return result.ok ? c.body(null, 204) : fail(c, result);
  });

  app.post('/classes/:id/live/:session/join', read, async (c) => {
    if (!deps.rooms) return unavailable(c);
    const id = sessionParam(c);
    if (!id.success) return c.json({ error: 'not_found' }, 404);
    const session = await deps.sessions.get(c.req.param('id'), id.data);
    if (!session) return c.json({ error: 'not_found' }, 404);
    if (session.status !== 'live') return c.json({ error: 'not_live' }, 409);
    const actor = c.get('actor');
    const role = (await isTeacher(c)) ? 'teacher' : 'learner';
    const token = await deps.rooms.token(
      roomName(session.id),
      { identity: actor.id, name: await deps.sessions.displayName(actor.id), role },
      (session.durationMinutes + OVERRUN_MINUTES) * 60
    );
    c.header('Cache-Control', 'no-store');
    return c.json({ url: deps.rooms.url, token, role, session });
  });

  app.post('/classes/:id/live/:session/floor', manage, async (c) => {
    if (!deps.rooms) return unavailable(c);
    const id = sessionParam(c);
    if (!id.success) return c.json({ error: 'not_found' }, 404);
    const parsed = FloorBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: 'invalid_body' }, 400);
    const session = await deps.sessions.get(c.req.param('id'), id.data);
    if (!session) return c.json({ error: 'not_found' }, 404);
    if (session.status !== 'live') return c.json({ error: 'not_live' }, 409);
    // The floor replaces all of a participant's rights: never touch a teacher's or an admin's.
    const target = await deps.classes.scope(c.req.param('id')!, parsed.data.identity);
    if (target.classRole !== 'student') return c.json({ error: 'not_in_room' }, 404);
    const changed = await deps.rooms.setFloor(
      roomName(session.id),
      parsed.data.identity,
      parsed.data.allowed
    );
    return changed ? c.body(null, 204) : c.json({ error: 'not_in_room' }, 404);
  });

  return app;
}
