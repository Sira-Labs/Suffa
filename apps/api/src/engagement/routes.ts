/**
 * Engagement as the server computed it (story 5.4):
 *   GET /api/v1/engagement → { state: { totalXp, level, streak, achievements, … } | null }
 * The app shows its own numbers right away and reconciles to these once its data is synced.
 */
import { Hono } from 'hono';
import type { Logger } from 'pino';
import type { AuthResolver } from '../auth/resolver.js';
import { authorize, type ActorEnv } from '../authz/middleware.js';
import type { EngagementRepository } from './repository.js';

export interface EngagementRouteDeps {
  repo: EngagementRepository;
  auth: AuthResolver;
  log: Pick<Logger, 'info' | 'warn' | 'error'>;
}

export function createEngagementRoutes(deps: EngagementRouteDeps): Hono<ActorEnv> {
  const app = new Hono<ActorEnv>();
  app.get('/', authorize(deps.auth, 'sync:own', deps.log), async (c) => {
    c.header('Cache-Control', 'no-store');
    return c.json({ state: await deps.repo.state(c.get('actor').id) });
  });
  return app;
}
