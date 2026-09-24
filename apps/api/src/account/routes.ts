/**
 * Account self-service, mounted at /api/v1/account (story 3.4):
 *
 *   GET    /sessions                → { sessions: [{ id, …, current }] }
 *   DELETE /sessions/:id            → 204 (404 when it is not one of yours)
 *   POST   /sessions/revoke-others  → { revoked }
 *   PATCH  /settings   { timeZone } → 204
 *   GET    /2fa                     → { enabled, confirmed }
 *   POST   /2fa/setup               → { uri, secret }  (409 when already enabled)
 *   POST   /2fa/confirm  { code }   → 204; enables a pending setup, confirms this session
 *   GET    /export                  → JSON download of everything stored about you (GDPR)
 *   DELETE /             { confirm: <your email> } → 204; deletes the account and its data
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
import type { SecondFactorService } from './secondFactor.js';
import type { PrivacyRepository } from '../privacy/repository.js';

export interface AccountRouteDeps {
  repo: AccountRepository;
  /** GDPR export and account deletion. */
  privacy?: PrivacyRepository;
  /** TOTP second factor (admins need it for admin actions). */
  secondFactor?: SecondFactorService;
  /** Records privileged account changes (second factor enabled). */
  audit?: (entry: {
    actorId: string;
    action: string;
    ip: string | null;
  }) => Promise<void>;
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

  const secondFactor = deps.secondFactor;
  if (secondFactor) {
    app.get('/2fa', read, async (c) => {
      const actor = c.get('actor');
      c.header('Cache-Control', 'no-store');
      return c.json({
        ...(await secondFactor.status(actor.id)),
        confirmed: actor.secondFactor === true,
      });
    });

    app.post('/2fa/setup', write, async (c) => {
      const actor = c.get('actor');
      const setup = await secondFactor.setup(actor.id, actor.email);
      if (!setup) return c.json({ error: 'already_enabled' }, 409);
      c.header('Cache-Control', 'no-store');
      return c.json(setup);
    });

    app.post('/2fa/confirm', write, async (c) => {
      const actor = c.get('actor');
      let body: unknown;
      try {
        body = await c.req.json();
      } catch {
        return c.json({ error: 'invalid_json' }, 400);
      }
      const parsed = z
        .object({ code: z.string().max(20) })
        .strict()
        .safeParse(body);
      if (!parsed.success) return c.json({ error: 'invalid_body' }, 400);
      const result = await secondFactor.confirm(
        actor.id,
        actor.sessionId,
        parsed.data.code
      );
      if (!result.ok) {
        deps.log.warn(
          { userId: actor.id, reason: result.reason },
          'account.2fa_rejected'
        );
        const status = result.reason === 'locked' ? 429 : 400;
        return c.json({ error: result.reason }, status);
      }
      if (result.newlyEnabled) {
        await deps.audit?.({
          actorId: actor.id,
          action: 'account.2fa_enabled',
          ip: c.req.header('x-real-ip') ?? null,
        });
      }
      return c.body(null, 204);
    });
  }

  const privacy = deps.privacy;
  if (privacy) {
    app.get('/export', read, async (c) => {
      const data = await privacy.export(c.get('actor').id);
      c.header('Cache-Control', 'no-store');
      c.header(
        'Content-Disposition',
        `attachment; filename="suffa-export-${data.exportedAt.slice(0, 10)}.json"`
      );
      return c.json(data);
    });

    app.delete('/', write, async (c) => {
      const actor = c.get('actor');
      let body: unknown;
      try {
        body = await c.req.json();
      } catch {
        return c.json({ error: 'invalid_json' }, 400);
      }
      // Typing the own address guards against a slip (and a forged click).
      const parsed = z
        .object({ confirm: z.string().max(320) })
        .strict()
        .safeParse(body);
      if (
        !parsed.success ||
        parsed.data.confirm.trim().toLowerCase() !== actor.email.toLowerCase()
      ) {
        return c.json({ error: 'confirmation_mismatch' }, 400);
      }
      await privacy.delete(actor.id, c.req.header('x-real-ip') ?? null);
      deps.log.info({ userId: actor.id }, 'account.deleted');
      return c.body(null, 204);
    });
  }

  return app;
}
