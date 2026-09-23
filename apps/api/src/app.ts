/**
 * HTTP application (Hono). Dependencies are injected so routes are testable without a
 * database. Routes live under /api (proxied by suffa-web's Caddy) plus /healthz.
 */
import { Hono } from 'hono';
import type { QueueDepth } from './jobs/queue.js';
import { createErrorTunnel, type ErrorTunnelDeps } from './observability/tunnel.js';
import { createSyncRoutes, type SyncRouteDeps } from './sync/routes.js';

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
  /** Browser error reporting: /api/client-config and the /api/errors tunnel. */
  errorTunnel?: ErrorTunnelDeps;
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

  app.get('/healthz', healthHandler);
  app.get('/api/healthz', healthHandler);
  app.get('/api/version', (c) =>
    c.json({
      name: 'suffa-api',
      version: deps.version,
      schemaRevision: deps.expectedRevision,
    })
  );
  if (deps.sync) app.route('/api/v1/sync', createSyncRoutes(deps.sync));
  if (deps.errorTunnel) app.route('/api', createErrorTunnel(deps.errorTunnel));
  app.notFound((c) => c.json({ error: 'not_found' }, 404));
  app.onError((error, c) => {
    deps.onUnhandledError?.(error, c.req.path);
    return c.json({ error: 'internal_error' }, 500);
  });
  return app;
}
