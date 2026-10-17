/**
 * Live lessons (ADR-0026), mounted at /api/v1:
 *
 *   GET    /classes/:id/live                    → { enabled, sessions }            (class:read)
 *   POST   /classes/:id/live                    { title, startsAt, durationMinutes,
 *                                                  audience?, learnerCameras? } → 201 (class:manage)
 *   POST   /classes/:id/live/:session/start     → the session, now live            (class:manage)
 *   POST   /classes/:id/live/:session/end       → the session, ended; room closed  (class:manage)
 *   DELETE /classes/:id/live/:session           → 204, a planned session removed   (class:manage)
 *   POST   /classes/:id/live/:session/join      → { url, token, role }             (class:read)
 *   POST   /classes/:id/live/:session/floor     { identity, allowed } → 204        (class:manage)
 *   POST   /classes/:id/live/:session/recording → 201, the session, now recorded (class:manage)
 *   DELETE /classes/:id/live/:session/recording → the session, recording stopped (class:manage)
 *   POST   /classes/:id/live/:session/invite    → 201 { url, expiresAt }          (class:manage)
 *   GET    /live-invites/:token                 → class, teacher and session       (class:join)
 *   POST   /live-invites/:token/join            → { classId, sessionId, status }   (class:join)
 *
 * Only active members of the class get a token, and only while the session is live. The
 * teacher's token may publish and moderate; a learner's may only listen, chat and raise a
 * hand until the teacher gives them the floor; only active learners of the class can be given
 * the floor (`not_in_room` for anyone else, so a teacher's own rights are never replaced).
 * Without a LiveKit server (`rooms` undefined) sessions are listed as disabled and nobody can
 * start or join one.
 *
 * Sisters and brothers (stage 2): a session is for everyone or for one section. Learners see
 * and join only sessions for everyone and for their own section (403 `wrong_audience`
 * otherwise); the teacher sees and leads all. With `learnerCameras` false the floor is the
 * learner's microphone only.
 *
 * Recording (Live 3, ADR-0029): the teacher records the room on the server into the class's
 * recordings; the list says whether recording is set up (`recordingEnabled`), so learners are
 * told before they join. Ending a session stops its recording.
 *
 * Invite links (see invites.ts): one link per session, for its time; opening it, a member goes
 * to the session and anyone else asks to join the class (pending until the teacher approves).
 */
import { Hono, type Context } from 'hono';
import { z } from 'zod';
import type { AuthResolver } from '../auth/resolver.js';
import { authorize, type ActorEnv, type AuthorizeLog } from '../authz/middleware.js';
import type { Actor as PolicyActor } from '../authz/policies.js';
import type { ClassRepository } from '../classes/repository.js';
import {
  OVERRUN_MINUTES,
  audiencesOf,
  type LiveActionResult,
  type LiveSessionRepository,
} from './repository.js';
import type { LiveInviteRepository } from './invites.js';
import type { LiveRecordings } from './recording.js';
import type { LiveRooms } from './rooms.js';

export interface LiveRouteDeps {
  classes: Pick<ClassRepository, 'scope'>;
  sessions: LiveSessionRepository;
  /** The LiveKit server; undefined while live lessons are not set up. */
  rooms: LiveRooms | undefined;
  /** Recording on the server; undefined while LiveKit Egress is not set up. */
  recordings?: LiveRecordings;
  /** Invite links to a session; undefined without a public URL to point them at. */
  invites?: { repo: LiveInviteRepository; publicUrl: string };
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
    audience: z.enum(['all', 'sisters', 'brothers']).default('all'),
    learnerCameras: z.boolean().default(true),
  })
  .strict();
const FloorBody = z.object({ identity: Uuid, allowed: z.boolean() }).strict();
const Token = z.string().regex(/^[A-Za-z0-9_-]{20,64}$/);

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
  const join = authorize(deps.auth, 'class:join', deps.log);

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

  /** The audiences the actor may see; undefined for the teacher (all of them). */
  const audiences = async (c: Context<ActorEnv>) =>
    (await isTeacher(c))
      ? undefined
      : audiencesOf(await deps.sessions.section(c.req.param('id')!, c.get('actor').id));

  app.get('/classes/:id/live', read, async (c) => {
    c.header('Cache-Control', 'no-store');
    const sessions = await deps.sessions.list(c.req.param('id'), await audiences(c));
    return c.json({
      enabled: deps.rooms !== undefined,
      recordingEnabled: deps.rooms !== undefined && deps.recordings !== undefined,
      sessions,
    });
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
      audience: parsed.data.audience,
      learnerCameras: parsed.data.learnerCameras,
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
    const before = await deps.sessions.get(c.req.param('id'), id.data);
    const result = await deps.sessions.end(c.req.param('id'), id.data, actorOf(c));
    if (!result.ok) return fail(c, result);
    if (before?.recording) {
      try {
        await deps.recordings?.stop(before, actorOf(c));
      } catch (error) {
        // Closing the room below ends the recording too; the worker stores what was recorded.
        deps.log.warn(
          { err: String(error), session: id.data },
          'live.recording_stop_failed'
        );
      }
    }
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
    const allowed = await audiences(c);
    if (allowed && !allowed.includes(session.audience)) {
      return c.json({ error: 'wrong_audience' }, 403);
    }
    const role = allowed ? 'learner' : 'teacher';
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
      parsed.data.allowed,
      { camera: session.learnerCameras }
    );
    return changed ? c.body(null, 204) : c.json({ error: 'not_in_room' }, 404);
  });

  /** The live session of the request, or the response to give instead. */
  const liveSession = async (c: Context<ActorEnv>) => {
    if (!deps.rooms || !deps.recordings) {
      return { response: c.json({ error: 'recording_unavailable' }, 503) };
    }
    const id = sessionParam(c);
    const session = id.success
      ? await deps.sessions.get(c.req.param('id')!, id.data)
      : null;
    if (!session) return { response: c.json({ error: 'not_found' }, 404) };
    if (session.status !== 'live')
      return { response: c.json({ error: 'not_live' }, 409) };
    return { session, recordings: deps.recordings };
  };

  app.post('/classes/:id/live/:session/recording', manage, async (c) => {
    const found = await liveSession(c);
    if ('response' in found) return found.response;
    const result = await found.recordings.start(
      found.session,
      roomName(found.session.id),
      actorOf(c)
    );
    if (!result.ok) {
      const status = {
        already_recording: 409,
        quota_exceeded: 422,
        recording_failed: 502,
      };
      return c.json({ error: result.reason }, status[result.reason] as 409 | 422 | 502);
    }
    const session = await deps.sessions.get(c.req.param('id'), found.session.id);
    return c.json({ session }, 201);
  });

  app.delete('/classes/:id/live/:session/recording', manage, async (c) => {
    const found = await liveSession(c);
    if ('response' in found) return found.response;
    if (!(await found.recordings.stop(found.session, actorOf(c)))) {
      return c.json({ error: 'not_recording' }, 409);
    }
    const session = await deps.sessions.get(c.req.param('id'), found.session.id);
    return c.json({ session });
  });

  app.post('/classes/:id/live/:session/invite', manage, async (c) => {
    if (!deps.invites) return c.json({ error: 'invites_unavailable' }, 503);
    const id = sessionParam(c);
    if (!id.success) return c.json({ error: 'not_found' }, 404);
    const invite = await deps.invites.repo.create(actorOf(c), c.req.param('id'), id.data);
    if (!invite) return c.json({ error: 'not_found' }, 404);
    c.header('Cache-Control', 'no-store');
    return c.json(
      {
        url: `${deps.invites.publicUrl}/live-invite/${invite.token}`,
        expiresAt: invite.expiresAt,
      },
      201
    );
  });

  app.get('/live-invites/:token', join, async (c) => {
    const token = Token.safeParse(c.req.param('token'));
    const preview =
      token.success && deps.invites ? await deps.invites.repo.preview(token.data) : null;
    if (!preview) return c.json({ error: 'invalid_invite' }, 404);
    c.header('Cache-Control', 'no-store');
    return c.json(preview);
  });

  app.post('/live-invites/:token/join', join, async (c) => {
    const token = Token.safeParse(c.req.param('token'));
    if (!token.success || !deps.invites) return c.json({ error: 'invalid_invite' }, 404);
    const result = await deps.invites.repo.join(actorOf(c), token.data);
    if (!result.ok) return c.json({ error: result.reason }, 404);
    return c.json({
      classId: result.classId,
      sessionId: result.sessionId,
      status: result.status,
    });
  });

  return app;
}
