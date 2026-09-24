/**
 * Entry point for both roles of the image: SUFFA_ROLE=api (default) or worker.
 * Exit codes: 1 = invalid configuration / fatal error, 3 = schema revision mismatch
 * (worker started before the api migrated; CapRover restarts it).
 */
import { fileURLToPath } from 'node:url';
import { serve } from '@hono/node-server';
import pg from 'pg';
import { pino } from 'pino';
import { createApp, type AuthRouteDeps } from './app.js';
import { ChainResolver, createAuth, SessionResolver } from './auth/betterAuth.js';
import { LogMailer, SmtpMailer } from './auth/mailer.js';
import { registerMaintenance } from './jobs/maintenance.js';
import { queueDepth, startBoss } from './jobs/queue.js';
import {
  createErrorReporter,
  disabledReporter,
  type ErrorReporter,
} from './observability/errors.js';
import { DenyAllResolver, DevTokenResolver, type AuthResolver } from './auth/resolver.js';
import { PgSyncRepository } from './sync/repository.js';
import { PgAdminRepository } from './admin/repository.js';
import { PgClassRepository } from './classes/repository.js';
import { PgAccountRepository } from './account/repository.js';
import type { AccountRouteDeps } from './account/routes.js';
import { PgSecondFactorRepository, SecondFactorService } from './account/secondFactor.js';
import { writeAudit } from './audit/log.js';
import { SecretBox } from './security/secretBox.js';
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

/** Module-level so the crash handler below can still report after main() failed. */
let errors: ErrorReporter = disabledReporter;

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
  errors = createErrorReporter({
    dsn: config.errorDsn,
    release: config.version,
    environment: config.env,
    role: config.role,
  });
  const pool = new pg.Pool({
    connectionString: config.databaseUrl,
    max: config.dbPoolMax,
  });
  pool.on('error', (error) => log.error({ err: error }, 'db.pool_error'));
  log.info(
    {
      version: config.version,
      db: redactDatabaseUrl(config.databaseUrl),
      errorTracking: errors.enabled,
    },
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
            onError: (error) => errors.capture(error, { source: 'pg-boss' }),
          });
          await registerMaintenance(boss, pool, log, errors);
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
        // Expected during a deploy (worker before api); not reported as an error.
        process.exit(3);
      }
      throw error;
    }
    await pool.end();
    return;
  }

  await migrate(pool, migrations, log);
  // The api only installs the queue schema and sends jobs; the worker processes them.
  const boss = await startBoss({
    databaseUrl: config.databaseUrl,
    role: 'api',
    log,
    onError: (error) => errors.capture(error, { source: 'pg-boss' }),
  });

  // Sign-in (magic link) needs a secret and the public URL; prod config enforces both.
  const resolvers: AuthResolver[] = [];
  let authRoutes: AuthRouteDeps | undefined;
  let accountRoutes: AccountRouteDeps | undefined;
  // In prod the link is never written to the log: without SMTP there is no sign-in.
  const canMail = Boolean(config.smtp) || config.env !== 'prod';
  if (config.authSecret && config.publicUrl && canMail) {
    const betterAuth = createAuth({
      pool,
      secret: config.authSecret,
      publicUrl: config.publicUrl,
      mailer: config.smtp ? new SmtpMailer(config.smtp, log) : new LogMailer(log),
      production: config.env === 'prod',
    });
    const sessions = new SessionResolver(betterAuth);
    resolvers.push(sessions);
    accountRoutes = {
      repo: new PgAccountRepository(pool),
      sessions: { actor: (h) => sessions.sessionActor(h) },
      secondFactor: new SecondFactorService(
        new PgSecondFactorRepository(pool),
        new SecretBox(config.authSecret, 'totp')
      ),
      audit: ({ actorId, action, ip }) =>
        writeAudit(pool, {
          actorId,
          action,
          targetType: 'user',
          targetId: actorId,
          ipAddress: ip,
        }),
      log,
    };
    authRoutes = {
      handler: (request) => betterAuth.handler(request),
      me: (h) => sessions.me(h),
    };
    // The origin is what browsers must send; a mismatch answers 403 INVALID_ORIGIN.
    log.info(
      { mail: config.smtp ? 'smtp' : 'log', origin: new URL(config.publicUrl).origin },
      'auth.enabled'
    );
  } else if (!canMail) {
    log.error(
      'auth.disabled: SMTP is not configured (SUFFA_SMTP_HOST and SUFFA_MAIL_FROM)'
    );
  } else {
    log.warn('auth.disabled (set SUFFA_AUTH_SECRET and SUFFA_PUBLIC_URL)');
  }
  if (config.syncDevTokens.size > 0) {
    const userIds = [...new Set(config.syncDevTokens.values())];
    await pool.query(
      'insert into users (id) select unnest($1::uuid[]) on conflict (id) do nothing',
      [userIds]
    );
    resolvers.push(new DevTokenResolver(config.syncDevTokens));
    log.warn({ users: userIds.length }, 'sync.dev_tokens_enabled');
  }
  const auth: AuthResolver =
    resolvers.length > 0 ? new ChainResolver(resolvers) : new DenyAllResolver();

  const app = createApp({
    version: config.version,
    expectedRevision: expected,
    health: {
      schemaRevision: () => currentRevision(pool),
      queueDepth: () => queueDepth(pool),
    },
    onProbeError: (error) => log.warn({ err: error }, 'health.db_unreachable'),
    sync: { repo: new PgSyncRepository(pool), auth, log },
    admin: { repo: new PgAdminRepository(pool), auth, log },
    classes: config.publicUrl
      ? {
          repo: new PgClassRepository(pool),
          auth,
          log,
          publicUrl: new URL(config.publicUrl).origin,
        }
      : undefined,
    authzLog: log,
    auth: authRoutes,
    account: accountRoutes,
    allowedOrigin: config.publicUrl ? new URL(config.publicUrl).origin : undefined,
    errorTunnel: { webDsn: config.webErrorDsn, log },
    onUnhandledError: (error, path) => {
      log.error({ err: error, path }, 'http.unhandled_error');
      errors.capture(error, { path });
    },
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

main().catch(async (error: unknown) => {
  console.error(
    JSON.stringify({ level: 'fatal', msg: 'service.crashed', err: String(error) })
  );
  errors.capture(error, { fatal: true });
  await errors.flush();
  process.exit(1);
});
