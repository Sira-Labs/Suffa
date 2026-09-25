/**
 * HTTP application (Hono). Dependencies are injected so routes are testable without a
 * database. Routes live under /api (proxied by suffa-web's Caddy) plus /healthz.
 */
import { Hono } from 'hono';
import type { QueueDepth } from './jobs/queue.js';
import { createErrorTunnel, type ErrorTunnelDeps } from './observability/tunnel.js';
import { createSyncRoutes, type SyncRouteDeps } from './sync/routes.js';
import {
  AUTH_BASE_PATH,
  isPublicAuthEndpoint,
  rejectUnsafeRedirect,
  type Me,
} from './auth/betterAuth.js';
import { createAccountRoutes, type AccountRouteDeps } from './account/routes.js';
import { createClassRoutes, type ClassRouteDeps } from './classes/routes.js';
import {
  createNotificationRoutes,
  type NotificationRouteDeps,
} from './notifications/routes.js';
import {
  createClassSpiritRoutes,
  type ClassSpiritRouteDeps,
} from './classes/spiritRoutes.js';
import { sameOriginOnly } from './http/sameOrigin.js';
import { createAdminRoutes, type AdminRouteDeps } from './admin/routes.js';
import { createEngagementRoutes, type EngagementRouteDeps } from './engagement/routes.js';
import { authorize, type AuthorizeLog } from './authz/middleware.js';

export interface AuthRouteDeps {
  /** Better Auth's request handler for everything under AUTH_BASE_PATH. */
  handler(request: Request): Promise<Response>;
  me(headers: Headers): Promise<Me | null>;
}

export interface HealthProbe {
  /** Resolves with the current schema revision; rejects when the database is unreachable. */
  schemaRevision(): Promise<string | null>;
  /** Job counts of the queue; rejects when the queue schema is missing. */
  queueDepth(): Promise<QueueDepth>;
}

export interface AppDeps {
  version: string;
  expectedRevision: string | null;
  health: HealthProbe;
  onProbeError?: (error: unknown) => void;
  /** Sync endpoints; omitted in tests that only exercise health/version. */
  sync?: SyncRouteDeps;
  /** Push reminders, their preferences and the weekly recap (stories 6.3, 6.4). */
  notifications?: NotificationRouteDeps;
  /** Class dashboard, challenge, teacher badges and shout-outs (Sprint 6). */
  classSpirit?: ClassSpiritRouteDeps;
  /** The server's copy of XP, streak and badges (story 5.4). */
  engagement?: EngagementRouteDeps;
  /** Browser error reporting: /api/client-config and the /api/errors tunnel. */
  errorTunnel?: ErrorTunnelDeps;
  /** Sign-in (Better Auth) and the signed-in user; omitted when sign-in is not configured. */
  auth?: AuthRouteDeps;
  /** Account self-service (sessions, settings) for the signed-in user. */
  account?: AccountRouteDeps;
  /**
   * Origins of the web app (SUFFA_PUBLIC_URL, SUFFA_TRUSTED_ORIGINS). When set, state-changing API requests that a
   * browser marks as coming from another site are refused (403).
   */
  allowedOrigin?: string | readonly string[];
  /** Classes, invites and membership approval. */
  classes?: ClassRouteDeps;
  /** Admin area (users); every route needs an admin. */
  admin?: AdminRouteDeps;
  /** Where denied requests are logged (authz.denied). */
  authzLog?: AuthorizeLog;
  /** Called for unhandled errors; the client only sees a generic 500. */
  onUnhandledError?: (error: unknown, path: string) => void;
}

export function createApp(deps: AppDeps): Hono {
  const app = new Hono();

  const healthHandler = async () => {
    try {
      const revision = await deps.health.schemaRevision();
      const schemaOk = revision === deps.expectedRevision;
      // The database answered, so a failing queue probe means pg-boss is not installed.
      const queue = await deps.health.queueDepth().catch((error: unknown) => {
        deps.onProbeError?.(error);
        return 'unavailable' as const;
      });
      const ok = schemaOk && queue !== 'unavailable';
      return Response.json(
        {
          status: ok ? 'ok' : 'degraded',
          version: deps.version,
          db: 'ok',
          schemaRevision: revision,
          expectedRevision: deps.expectedRevision,
          queue,
        },
        { status: ok ? 200 : 503 }
      );
    } catch (error) {
      deps.onProbeError?.(error);
      return Response.json(
        { status: 'error', version: deps.version, db: 'unreachable' },
        { status: 503 }
      );
    }
  };

  if (deps.allowedOrigin?.length) app.use('/api/*', sameOriginOnly(deps.allowedOrigin));

  app.get('/healthz', healthHandler);
  app.get('/api/healthz', healthHandler);
  app.get('/api/version', (c) =>
    c.json({
      name: 'suffa-api',
      version: deps.version,
      schemaRevision: deps.expectedRevision,
    })
  );
  if (deps.auth) {
    const auth = deps.auth;
    app.on(['GET', 'POST'], `${AUTH_BASE_PATH}/*`, async (c) => {
      // Only the endpoints magic-link sign-in needs; everything else Better Auth ships is off.
      if (!isPublicAuthEndpoint(c.req.method, c.req.path)) {
        return c.json({ error: 'not_found' }, 404);
      }
      const rejected = await rejectUnsafeRedirect(c.req.raw);
      return rejected ?? auth.handler(c.req.raw);
    });
    // The profile doubles as the actor: one session lookup per request.
    const profiles = { actor: (headers: Headers) => auth.me(headers) };
    app.get('/api/v1/me', authorize(profiles, 'profile:read', deps.authzLog), (c) => {
      c.header('Cache-Control', 'no-store');
      return c.json(c.get('actor'));
    });
  }
  if (deps.sync) app.route('/api/v1/sync', createSyncRoutes(deps.sync));
  if (deps.engagement) {
    app.route('/api/v1/engagement', createEngagementRoutes(deps.engagement));
  }
  if (deps.account) app.route('/api/v1/account', createAccountRoutes(deps.account));
  if (deps.classes) app.route('/api/v1', createClassRoutes(deps.classes));
  if (deps.classSpirit) app.route('/api/v1', createClassSpiritRoutes(deps.classSpirit));
  if (deps.notifications) {
    app.route('/api/v1', createNotificationRoutes(deps.notifications));
  }
  if (deps.admin) app.route('/api/v1/admin', createAdminRoutes(deps.admin));
  if (deps.errorTunnel) app.route('/api', createErrorTunnel(deps.errorTunnel));
  app.notFound((c) => c.json({ error: 'not_found' }, 404));
  app.onError((error, c) => {
    deps.onUnhandledError?.(error, c.req.path);
    return c.json({ error: 'internal_error' }, 500);
  });
  return app;
}
