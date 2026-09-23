/**
 * Background jobs on pg-boss (ADR-0020): a Postgres-backed queue, so Suffa needs no Redis.
 *
 * - Both roles start pg-boss: it installs/migrates its own `pgboss` schema under an advisory
 *   lock, so whichever role starts first wins and the other is a no-op.
 * - Only the worker supervises (maintenance, cron) and processes jobs; the api only sends.
 * - Queue depth is counted directly in `pgboss.job`, not from pg-boss's cached counters: those
 *   are refreshed by the worker, so they would freeze exactly when the worker is down.
 */
import { PgBoss } from 'pg-boss';
import type { Logger } from 'pino';
import type { SqlPool } from '../migrate.js';

/** Queues from ADR-0020; handlers are added as the features that produce jobs arrive. */
export const QUEUES = [
  'sync-derived',
  'media',
  'engagement',
  'notifications',
  'imports',
  'maintenance',
] as const;
export type QueueName = (typeof QUEUES)[number];

/** Jobs that exhausted their retries end up here for inspection. */
export const DEAD_LETTER_QUEUE = 'dead-letter';

export const PGBOSS_SCHEMA = 'pgboss';

/** pg-boss keeps its own small pool next to the app pool. */
const PGBOSS_POOL_MAX = 3;

export interface BossOptions {
  databaseUrl: string;
  role: 'api' | 'worker';
  log: Pick<Logger, 'error' | 'warn'>;
}

/** Starts pg-boss for a role and makes sure every queue exists (idempotent). */
export async function startBoss(opts: BossOptions): Promise<PgBoss> {
  const isWorker = opts.role === 'worker';
  const boss = new PgBoss({
    connectionString: opts.databaseUrl,
    schema: PGBOSS_SCHEMA,
    max: PGBOSS_POOL_MAX,
    application_name: `suffa-${opts.role}-queue`,
    migrate: true,
    supervise: isWorker,
    schedule: isWorker,
  });
  boss.on('error', (error: Error) => opts.log.error({ err: error }, 'queue.error'));
  await boss.start();
  await boss.createQueue(DEAD_LETTER_QUEUE);
  for (const name of QUEUES) {
    await boss.createQueue(name, {
      deadLetter: DEAD_LETTER_QUEUE,
      retryLimit: 3,
      retryBackoff: true,
    });
  }
  return boss;
}

export interface QueueDepth {
  /** Jobs waiting to run (created or retrying), excluding the dead-letter queue. */
  waiting: number;
  active: number;
  /** Failed jobs still within pg-boss's retention window. */
  failed: number;
  /** Jobs parked in the dead-letter queue. */
  deadLetter: number;
}

export async function queueDepth(pool: SqlPool): Promise<QueueDepth> {
  const client = await pool.connect();
  try {
    const { rows } = await client.query<{
      waiting: number;
      active: number;
      failed: number;
      dead_letter: number;
    }>(
      `select
         count(*) filter (where state in ('created', 'retry') and name <> $1)::int as waiting,
         count(*) filter (where state = 'active')::int as active,
         count(*) filter (where state = 'failed')::int as failed,
         count(*) filter (where state in ('created', 'retry') and name = $1)::int as dead_letter
       from ${PGBOSS_SCHEMA}.job
       where state in ('created', 'retry', 'active', 'failed')`,
      [DEAD_LETTER_QUEUE]
    );
    const row = rows[0];
    return {
      waiting: row.waiting,
      active: row.active,
      failed: row.failed,
      deadLetter: row.dead_letter,
    };
  } finally {
    client.release();
  }
}
