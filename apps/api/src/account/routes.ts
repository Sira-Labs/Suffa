/**
 * Account self-service, mounted at /api/v1/account (story 3.4):
 *
 *   GET    /sessions                → { sessions: [{ id, …, current }] }
 *   DELETE /sessions/:id            → 204 (404 when it is not one of yours)
 *   POST   /sessions/revoke-others  → { revoked }
 *   PATCH  /settings   { timeZone } → 204
 *
 * Sessions live in the database and are checked on every request (no cookie cache), so an
 * ended session fails on its very next request.
 */
import { Hono } from 'hono';
import { z } from 'zod';
import type { SessionActor } from '../auth/betterAuth.js';
import {
  authorize,
  type ActorEnv,
  type ActorSource,
  type AuthorizeLog,
} from '../authz/middleware.js';
import type { AccountRepository } from './repository.js';

export interface AccountRouteDeps {
  repo: AccountRepository;
  /** Resolves the signed-in user together with the session of the request. */
  sessions: ActorSource<SessionActor>;
  log: AuthorizeLog & { info(obj: object, msg: string): void };
}

/** Is `value` a time zone this runtime knows (e.g. "Europe/Zurich", "UTC")? */
export function isTimeZone(value: string): boolean {
  if (!/^[A-Za-z][A-Za-z0-9_+-]*(?:\/[A-Za-z0-9_+-]+)*$/.test(value)) return false;
  try {
    new Intl.DateTimeFormat('en', { timeZone: value });
    return true;
  } catch (error) {
    if (error instanceof RangeError) return false;
    throw error;
  }
}

const Settings = z
  .object({
    timeZone: z
      .string()
      .max(64)
      .refine(isTimeZone, 'unknown time zone')
      .nullable()
      .optional(),
  })
  .strict();

const SessionId = z.string().min(1).max(200);

export function createAccountRoutes(
  deps: AccountRouteDeps
): Hono<ActorEnv<SessionActor>> {
  const app = new Hono<ActorEnv<SessionActor>>();
  const read = authorize(deps.sessions, 'profile:read', deps.log);
  const write = authorize(deps.sessions, 'profile:write', deps.log);

  app.get('/sessions', read, async (c) => {
    const actor = c.get('actor');
    const sessions = await deps.repo.listSessions(actor.id);
    c.header('Cache-Control', 'no-store');
    return c.json({
      sessions: sessions.map((s) => ({ ...s, current: s.id === actor.sessionId })),
    });
  });

  app.post('/sessions/revoke-others', write, async (c) => {
    const actor = c.get('actor');
    const revoked = await deps.repo.revokeOtherSessions(actor.id, actor.sessionId);
    deps.log.info({ userId: actor.id, revoked }, 'account.sessions_revoked');
    return c.json({ revoked });
  });

  app.delete('/sessions/:id', write, async (c) => {
    const actor = c.get('actor');
    const id = SessionId.safeParse(c.req.param('id'));
    if (!id.success) return c.json({ error: 'not_found' }, 404);
    const revoked = await deps.repo.revokeSession(actor.id, id.data);
    if (!revoked) return c.json({ error: 'not_found' }, 404);
    deps.log.info(
      { userId: actor.id, current: id.data === actor.sessionId },
      'account.session_revoked'
    );
    return c.body(null, 204);
  });

  app.patch('/settings', write, async (c) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: 'invalid_json' }, 400);
    }
    const settings = Settings.safeParse(body);
    if (!settings.success) {
      return c.json(
        { error: 'invalid_body', issues: settings.error.issues.map((i) => i.message) },
        400
      );
    }
    if (settings.data.timeZone !== undefined) {
      await deps.repo.setTimeZone(c.get('actor').id, settings.data.timeZone);
    }
    return c.body(null, 204);
  });

  return app;
}
