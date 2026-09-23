/**
 * HTTP application (Hono). Dependencies are injected so routes are testable without a
 * database. Routes live under /api (proxied by suffa-web's Caddy) plus /healthz.
 */
import { Hono } from 'hono';

export interface HealthProbe {
  /** Resolves with the current schema revision; rejects when the database is unreachable. */
  schemaRevision(): Promise<string | null>;
}

export interface AppDeps {
  version: string;
  expectedRevision: string | null;
  health: HealthProbe;
  onProbeError?: (error: unknown) => void;
}

export function createApp(deps: AppDeps): Hono {
  const app = new Hono();

  const healthHandler = async () => {
    try {
      const revision = await deps.health.schemaRevision();
      const schemaOk = revision === deps.expectedRevision;
      return Response.json(
        {
          status: schemaOk ? 'ok' : 'degraded',
          version: deps.version,
          db: 'ok',
          schemaRevision: revision,
          expectedRevision: deps.expectedRevision,
        },
        { status: schemaOk ? 200 : 503 }
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
  app.notFound((c) => c.json({ error: 'not_found' }, 404));
  return app;
}
