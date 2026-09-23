/**
 * Worker role: verifies the schema revision, starts the job queue (pg-boss, ADR-0020) and
 * writes a heartbeat so operators can see it is alive. On shutdown the queue drains first.
 */
import { hostname } from 'node:os';
import { setTimeout as sleep } from 'node:timers/promises';
import type { Logger } from 'pino';
import { currentRevision, SchemaMismatchError, type SqlPool } from './migrate.js';

/** Stops the job queue; resolves once running jobs have finished or timed out. */
export type StopJobs = () => Promise<void>;

export interface WorkerOptions {
  pool: SqlPool;
  /** Starts processing jobs; injected so the loop is testable without pg-boss. */
  startJobs: () => Promise<StopJobs>;
  expectedRevision: string | null;
  version: string;
  heartbeatMs: number;
  log: Logger;
  signal: AbortSignal;
}

export async function runWorker(opts: WorkerOptions): Promise<void> {
  const actual = await currentRevision(opts.pool);
  if (actual !== opts.expectedRevision) {
    throw new SchemaMismatchError(opts.expectedRevision, actual);
  }
  const instance = hostname();
  const stopJobs = await opts.startJobs();
  opts.log.info({ revision: actual, instance }, 'worker.start');

  try {
    await heartbeatLoop(opts, instance);
  } finally {
    await stopJobs();
  }
  opts.log.info({ instance }, 'worker.stop');
}

async function heartbeatLoop(opts: WorkerOptions, instance: string): Promise<void> {
  while (!opts.signal.aborted) {
    const client = await opts.pool.connect();
    try {
      await client.query(
        `insert into service_heartbeats (role, instance, version, beat_at)
         values ('worker', $1, $2, now())
         on conflict (role, instance) do update set version = excluded.version, beat_at = now()`,
        [instance, opts.version]
      );
    } finally {
      client.release();
    }
    try {
      await sleep(opts.heartbeatMs, undefined, { signal: opts.signal });
    } catch (error) {
      if ((error as { name?: string }).name === 'AbortError') break;
      throw error;
    }
  }
}
