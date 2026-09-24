/**
 * Sync endpoints, mounted at /api/v1/sync (same contract as the PWA's SyncProvider):
 *
 *   POST /:table/push   body { records: [...] }          → { received, applied }
 *   GET  /:table/pull   ?since=ISO&afterId=&limit=      → { records, next }
 *
 * Every request needs the `sync:own` permission (authz middleware); `user_id` is the signed-in
 * actor's and any `user_id` in the payload is ignored (the schemas strip unknown fields).
 */
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import type { Logger } from 'pino';
import { z } from 'zod';
import type { AuthResolver } from '../auth/resolver.js';
import { authorize, type ActorEnv } from '../authz/middleware.js';
import type { SyncRepository } from './repository.js';
import {
  DEFAULT_PULL_LIMIT,
  isSyncTable,
  MAX_PULL_LIMIT,
  MAX_PUSH_RECORDS,
  SYNC_SCHEMAS,
  type SyncRecord,
} from './schemas.js';

export interface SyncRouteDeps {
  repo: SyncRepository;
  auth: AuthResolver;
  log: Pick<Logger, 'info' | 'warn' | 'error'>;
}

const MAX_BODY_BYTES = 2 * 1024 * 1024;

const PullQuery = z.object({
  since: z.string().datetime({ offset: true }).optional(),
  afterId: z.string().min(1).max(200).optional(),
  limit: z.coerce.number().int().min(1).max(MAX_PULL_LIMIT).default(DEFAULT_PULL_LIMIT),
});

export function createSyncRoutes(deps: SyncRouteDeps): Hono<ActorEnv> {
  const app = new Hono<ActorEnv>();

  app.use('*', authorize(deps.auth, 'sync:own', deps.log));

  app.post(
    '/:table/push',
    bodyLimit({
      maxSize: MAX_BODY_BYTES,
      onError: (c) => c.json({ error: 'payload_too_large' }, 413),
    }),
    async (c) => {
      const table = c.req.param('table');
      if (!isSyncTable(table)) return c.json({ error: 'unknown_table' }, 404);

      let body: unknown;
      try {
        body = await c.req.json();
      } catch {
        return c.json({ error: 'invalid_json' }, 400);
      }
      const envelope = z
        .object({ records: z.array(z.unknown()).max(MAX_PUSH_RECORDS) })
        .safeParse(body);
      if (!envelope.success) {
        return c.json(
          {
            error: 'invalid_body',
            message: `expected { records: [...] } with at most ${MAX_PUSH_RECORDS} records`,
          },
          400
        );
      }

      const schema = SYNC_SCHEMAS[table];
      const records: SyncRecord[] = [];
      for (const [index, raw] of envelope.data.records.entries()) {
        const parsed = schema.safeParse(raw);
        if (!parsed.success) {
          const issues = parsed.error.issues.map((i) => ({
            path: i.path.join('.'),
            message: i.message,
          }));
          return c.json({ error: 'invalid_record', index, issues }, 400);
        }
        records.push(parsed.data as SyncRecord);
      }

      const userId = c.get('actor').id;
      const applied = await deps.repo.upsert(userId, table, records);
      deps.log.info({ table, userId, received: records.length, applied }, 'sync.push');
      return c.json({ received: records.length, applied });
    }
  );

  app.get('/:table/pull', async (c) => {
    const table = c.req.param('table');
    if (!isSyncTable(table)) return c.json({ error: 'unknown_table' }, 404);
    const query = PullQuery.safeParse(c.req.query());
    if (!query.success) {
      return c.json(
        { error: 'invalid_query', issues: query.error.issues.map((i) => i.message) },
        400
      );
    }
    if (query.data.afterId && !query.data.since) {
      return c.json({ error: 'invalid_query', issues: ['afterId requires since'] }, 400);
    }
    const page = await deps.repo.pull(c.get('actor').id, table, {
      since: query.data.since ?? null,
      afterId: query.data.afterId ?? null,
      limit: query.data.limit,
    });
    return c.json(page);
  });

  return app;
}
