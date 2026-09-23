/**
 * Worker role (skeleton). Until the pg-boss queues arrive (ADR-0020), the worker verifies
 * the schema revision and writes a heartbeat so operators can see it is alive.
 */
import { hostname } from 'node:os';
import { setTimeout as sleep } from 'node:timers/promises';
import type { Logger } from 'pino';
import { currentRevision, SchemaMismatchError, type SqlPool } from './migrate.js';

export interface WorkerOptions {
  pool: SqlPool;
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
  opts.log.info({ revision: actual, instance }, 'worker.start');

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
  opts.log.info({ instance }, 'worker.stop');
}
