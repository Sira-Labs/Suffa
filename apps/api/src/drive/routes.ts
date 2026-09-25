/**
 * Google Drive for teachers (story 7.2), mounted at /api/v1:
 *
 *   GET    /drive                 → { connected, apiKey, appId }            (class:create)
 *   GET    /drive/connect?returnTo=/classes/…  → 302 to Google's consent    (class:create)
 *   GET    /drive/callback?code&state         → 302 back into the app      (class:create)
 *   POST   /drive/token           → { accessToken } for the Picker          (class:create)
 *   DELETE /drive                 → 204, revokes and forgets the token      (class:create)
 *   POST   /classes/:id/media/drive { fileIds } → 202, imports queued      (class:manage)
 */
import { Hono, type Context } from 'hono';
import type { Logger } from 'pino';
import { z } from 'zod';
import type { AuthResolver } from '../auth/resolver.js';
import { authorize, type ActorEnv } from '../authz/middleware.js';
import type { Actor as PolicyActor, ClassScope } from '../authz/policies.js';
import { GoogleError, type GoogleClient } from './google.js';
import type { DriveService } from './service.js';
import { readState, signState } from './state.js';

export interface DriveRouteDeps {
  drive: DriveService;
  google: Pick<GoogleClient, 'authUrl'>;
  classes: { scope(classId: string, userId: string): Promise<ClassScope> };
  /** Browser key and project number for the Google Picker. */
  picker: { apiKey: string; appId: string };
  /** Signs the OAuth state. */
  stateSecret: string;
  auth: AuthResolver;
  log: Pick<Logger, 'info' | 'warn' | 'error'>;
}

const Uuid = z.string().uuid();
const Import = z
  .object({
    fileIds: z
      .array(z.string().regex(/^[A-Za-z0-9_-]{10,100}$/))
      .min(1)
      .max(20),
  })
  .strict();

const withParam = (path: string, key: string, value: string) =>
  `${path}${path.includes('?') ? '&' : '?'}${key}=${value}`;

export function createDriveRoutes(deps: DriveRouteDeps): Hono<ActorEnv> {
  const app = new Hono<ActorEnv>();
  const teacher = authorize(deps.auth, 'class:create', deps.log);
  const scope = async (c: Context, actor: PolicyActor) => {
    const id = Uuid.safeParse(c.req.param('id'));
    return id.success ? deps.classes.scope(id.data, actor.id) : { classRole: null };
  };
  const manage = authorize(deps.auth, 'class:manage', deps.log, scope);

  app.get('/drive', teacher, async (c) => {
    c.header('Cache-Control', 'no-store');
    return c.json({
      connected: await deps.drive.connected(c.get('actor').id),
      apiKey: deps.picker.apiKey,
      appId: deps.picker.appId,
    });
  });

  app.get('/drive/connect', teacher, (c) => {
    const returnTo = c.req.query('returnTo') ?? '/classes';
    const state = signState(deps.stateSecret, c.get('actor').id, returnTo);
    return c.redirect(deps.google.authUrl(state), 302);
  });

  app.get('/drive/callback', teacher, async (c) => {
    const state = readState(deps.stateSecret, c.req.query('state') ?? '');
    // The consent must come back to the same signed-in teacher who started it.
    if (!state || state.userId !== c.get('actor').id) {
      return c.redirect(withParam('/classes', 'drive', 'failed'), 302);
    }
    const code = c.req.query('code');
    if (!code) return c.redirect(withParam(state.returnTo, 'drive', 'cancelled'), 302);
    try {
      await deps.drive.connect(state.userId, code);
    } catch (error) {
      if (!(error instanceof GoogleError)) throw error;
      deps.log.warn({ status: error.status }, 'drive.connect_failed');
      return c.redirect(withParam(state.returnTo, 'drive', 'failed'), 302);
    }
    return c.redirect(withParam(state.returnTo, 'drive', 'connected'), 302);
  });

  app.post('/drive/token', teacher, async (c) => {
    c.header('Cache-Control', 'no-store');
    try {
      const accessToken = await deps.drive.accessToken(c.get('actor').id);
      if (!accessToken) return c.json({ error: 'not_connected' }, 409);
      return c.json({ accessToken });
    } catch (error) {
      if (!(error instanceof GoogleError)) throw error;
      // Revoked in the Google account: connect again.
      return c.json({ error: 'not_connected' }, 409);
    }
  });

  app.delete('/drive', teacher, async (c) => {
    await deps.drive.disconnect(c.get('actor').id);
    return c.body(null, 204);
  });

  app.post('/classes/:id/media/drive', manage, async (c) => {
    let body: unknown = null;
    try {
      body = await c.req.json();
    } catch (error) {
      if (!(error instanceof SyntaxError)) throw error;
    }
    const parsed = Import.safeParse(body);
    if (!parsed.success) return c.json({ error: 'invalid_body' }, 400);
    const result = await deps.drive.import(
      c.req.param('id'),
      c.get('actor').id,
      parsed.data.fileIds
    );
    if (!result.ok)
      return c.json(
        { error: result.reason },
        result.reason === 'not_connected' ? 409 : 422
      );
    return c.json({ ids: result.ids }, 202);
  });

  return app;
}
