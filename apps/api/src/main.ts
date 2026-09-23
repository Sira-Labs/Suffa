/**
 * Entry point for both roles of the image: SUFFA_ROLE=api (default) or worker.
 * Exit codes: 1 = invalid configuration / fatal error, 3 = schema revision mismatch
 * (worker started before the api migrated; CapRover restarts it).
 */
import { fileURLToPath } from 'node:url';
import { serve } from '@hono/node-server';
import pg from 'pg';
import { pino } from 'pino';
import { createApp } from './app.js';
import { registerMaintenance } from './jobs/maintenance.js';
import { queueDepth, startBoss } from './jobs/queue.js';
import { DenyAllResolver, DevTokenResolver, type AuthResolver } from './auth/resolver.js';
import { PgSyncRepository } from './sync/repository.js';
import { ConfigError, loadConfig, redactDatabaseUrl } from './config.js';
import {
  currentRevision,
  expectedRevision,
  loadMigrations,
  migrate,
  SchemaMismatchError,
} from './migrate.js';
import { runWorker } from './worker.js';

const MIGRATIONS_DIR = fileURLToPath(new URL('../migrations', import.meta.url));
/** Running jobs get this long to finish on shutdown; Docker/CapRover sends SIGKILL after 10 s. */
const JOB_DRAIN_TIMEOUT_MS = 8_000;

async function main(): Promise<void> {
  let config;
  try {
    config = loadConfig(process.env);
  } catch (error) {
    if (error instanceof ConfigError) {
      // Logger is not configured yet; one structured line on stderr is enough.
      console.error(
        JSON.stringify({ level: 'fatal', msg: 'config.invalid', issues: error.issues })
      );
      process.exit(1);
    }
    throw error;
  }

  const log = pino({
    level: config.logLevel,
    base: { service: 'suffa', role: config.role },
  });
  const pool = new pg.Pool({
    connectionString: config.databaseUrl,
    max: config.dbPoolMax,
  });
  pool.on('error', (error) => log.error({ err: error }, 'db.pool_error'));
  log.info(
    { version: config.version, db: redactDatabaseUrl(config.databaseUrl) },
    'service.starting'
  );

  const migrations = await loadMigrations(MIGRATIONS_DIR);
  const expected = expectedRevision(migrations);
  const shutdown = new AbortController();
  const onSignal = (signal: NodeJS.Signals) => {
    log.info({ signal }, 'service.stopping');
    shutdown.abort();
  };
  process.once('SIGTERM', onSignal);
  process.once('SIGINT', onSignal);

  if (config.role === 'worker') {
    try {
      await runWorker({
        pool,
        startJobs: async () => {
          const boss = await startBoss({
            databaseUrl: config.databaseUrl,
            role: 'worker',
            log,
          });
          await registerMaintenance(boss, pool, log);
          return () => boss.stop({ graceful: true, timeout: JOB_DRAIN_TIMEOUT_MS });
        },
        expectedRevision: expected,
        version: config.version,
        heartbeatMs: config.workerHeartbeatMs,
        log,
        signal: shutdown.signal,
      });
    } catch (error) {
      if (error instanceof SchemaMismatchError) {
        log.warn(
          { expected: error.expected, actual: error.actual },
          'db.schema_mismatch'
        );
        await pool.end();
        process.exit(3);
      }
      throw error;
    }
    await pool.end();
    return;
  }

  await migrate(pool, migrations, log);
  // The api only installs the queue schema and sends jobs; the worker processes them.
  const boss = await startBoss({ databaseUrl: config.databaseUrl, role: 'api', log });

  // Until Better Auth (Sprint 3) sync is closed, except for dev tokens outside prod.
  let auth: AuthResolver = new DenyAllResolver();
  if (config.syncDevTokens.size > 0) {
    const userIds = [...new Set(config.syncDevTokens.values())];
    await pool.query(
      'insert into users (id) select unnest($1::uuid[]) on conflict (id) do nothing',
      [userIds]
    );
    auth = new DevTokenResolver(config.syncDevTokens);
    log.warn({ users: userIds.length }, 'sync.dev_tokens_enabled');
  }

  const app = createApp({
    version: config.version,
    expectedRevision: expected,
    health: {
      schemaRevision: () => currentRevision(pool),
      queueDepth: () => queueDepth(pool),
    },
    onProbeError: (error) => log.warn({ err: error }, 'health.db_unreachable'),
    sync: { repo: new PgSyncRepository(pool), auth, log },
    onUnhandledError: (error, path) =>
      log.error({ err: error, path }, 'http.unhandled_error'),
  });
  const server = serve(
    { fetch: app.fetch, port: config.port, hostname: '0.0.0.0' },
    (info) => log.info({ port: info.port }, 'http.listening')
  );
  shutdown.signal.addEventListener('abort', () => {
    server.close(() => {
      void boss
        .stop({ graceful: false })
        .then(() => pool.end())
        .then(() => log.info('service.stopped'));
    });
  });
}

main().catch((error: unknown) => {
  console.error(
    JSON.stringify({ level: 'fatal', msg: 'service.crashed', err: String(error) })
  );
  process.exit(1);
});
