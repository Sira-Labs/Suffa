/**
 * `maintenance` queue: housekeeping tasks the worker runs on a schedule.
 *
 * Every redeploy starts containers with new hostnames, so `service_heartbeats` gains a row per
 * instance that is never updated again; `prune-heartbeats` removes rows older than a week.
 * `prune-conversations` deletes tutor conversations untouched for 90 days (ADR-0011 privacy).
 * `prune-quizzes` ends live quizzes left running for 12 hours (a teacher closed the tab) and
 * deletes finished ones after 30 days with their answers (story 14.4).
 */
import type { PgBoss, Job } from 'pg-boss';
import type { Logger } from 'pino';
import { z } from 'zod';
import type { SqlPool } from '../migrate.js';
import type { ErrorReporter } from '../observability/errors.js';
import type { QueueName } from './queue.js';

export const MAINTENANCE_QUEUE: QueueName = 'maintenance';

const HEARTBEAT_RETENTION_DAYS = 7;
export const CONVERSATION_RETENTION_DAYS = 90;
export const QUIZ_ABANDONED_HOURS = 12;
export const QUIZ_RETENTION_DAYS = 30;

export const MaintenanceJob = z.discriminatedUnion('task', [
  z.object({ task: z.literal('prune-heartbeats') }),
  z.object({ task: z.literal('prune-conversations') }),
  z.object({ task: z.literal('prune-quizzes') }),
]);
export type MaintenanceJob = z.infer<typeof MaintenanceJob>;

/** Cron schedules (UTC), keyed so re-registering on every start just updates them. */
export const MAINTENANCE_SCHEDULES: ReadonlyArray<{ cron: string; job: MaintenanceJob }> =
  [
    { cron: '17 3 * * *', job: { task: 'prune-heartbeats' } },
    { cron: '27 3 * * *', job: { task: 'prune-conversations' } },
    { cron: '37 3 * * *', job: { task: 'prune-quizzes' } },
  ];

export async function pruneHeartbeats(pool: SqlPool): Promise<number> {
  const client = await pool.connect();
  try {
    const { rows } = await client.query(
      `delete from service_heartbeats
       where beat_at < now() - make_interval(days => $1)
       returning role`,
      [HEARTBEAT_RETENTION_DAYS]
    );
    return rows.length;
  } finally {
    client.release();
  }
}

export async function pruneConversations(pool: SqlPool): Promise<number> {
  const client = await pool.connect();
  try {
    const { rows } = await client.query(
      `delete from ai_conversations where updated_at < now() - make_interval(days => $1)
       returning id`,
      [CONVERSATION_RETENTION_DAYS]
    );
    return rows.length;
  } finally {
    client.release();
  }
}

export async function pruneQuizzes(
  pool: SqlPool
): Promise<{ ended: number; removed: number }> {
  const client = await pool.connect();
  try {
    const ended = await client.query(
      `update live_quizzes set status = 'finished', finished_at = now(), version = version + 1
        where status <> 'finished' and created_at < now() - make_interval(hours => $1)
        returning id`,
      [QUIZ_ABANDONED_HOURS]
    );
    const removed = await client.query(
      `delete from live_quizzes where finished_at < now() - make_interval(days => $1)
       returning id`,
      [QUIZ_RETENTION_DAYS]
    );
    return { ended: ended.rows.length, removed: removed.rows.length };
  } finally {
    client.release();
  }
}

/** Runs one maintenance job; throws on unknown payloads so pg-boss retries/dead-letters them. */
export async function runMaintenance(
  pool: SqlPool,
  raw: unknown,
  log: Pick<Logger, 'info'>
): Promise<void> {
  const job = MaintenanceJob.parse(raw);
  switch (job.task) {
    case 'prune-heartbeats': {
      const removed = await pruneHeartbeats(pool);
      log.info({ task: job.task, removed }, 'maintenance.done');
      return;
    }
    case 'prune-conversations': {
      const removed = await pruneConversations(pool);
      log.info({ task: job.task, removed }, 'maintenance.done');
      return;
    }
    case 'prune-quizzes': {
      const result = await pruneQuizzes(pool);
      log.info({ task: job.task, ...result }, 'maintenance.done');
      return;
    }
  }
}

/** Registers the maintenance schedules and handler on a worker's pg-boss instance. */
export async function registerMaintenance(
  boss: PgBoss,
  pool: SqlPool,
  log: Pick<Logger, 'info'>,
  errors: ErrorReporter
): Promise<void> {
  for (const { cron, job } of MAINTENANCE_SCHEDULES) {
    await boss.schedule(MAINTENANCE_QUEUE, cron, job, { key: job.task, tz: 'UTC' });
  }
  await boss.work(MAINTENANCE_QUEUE, async (jobs: Job<unknown>[]) => {
    for (const job of jobs) {
      try {
        await runMaintenance(pool, job.data, log);
      } catch (error) {
        // Reported on every attempt; pg-boss still retries and finally dead-letters it.
        errors.capture(error, { queue: MAINTENANCE_QUEUE, jobId: job.id });
        throw error;
      }
    }
  });
}
