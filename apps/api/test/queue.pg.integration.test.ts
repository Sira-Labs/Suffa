/**
 * Job queue against a real Postgres: pg-boss install, queue depth, the maintenance job and
 * its schedule. Run with SUFFA_TEST_DATABASE_URL=postgres://… ; skipped otherwise. The
 * database is wiped, so never point this at real data.
 */
import { join } from 'node:path';
import pg from 'pg';
import type { PgBoss } from 'pg-boss';
import { pino } from 'pino';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { MAINTENANCE_QUEUE, registerMaintenance } from '../src/jobs/maintenance.js';
import { DEAD_LETTER_QUEUE, QUEUES, queueDepth, startBoss } from '../src/jobs/queue.js';
import { loadMigrations, migrate } from '../src/migrate.js';
import type { ErrorReporter } from '../src/observability/errors.js';

const url = process.env.SUFFA_TEST_DATABASE_URL;
const log = pino({ level: 'silent' });
const errors = {
  enabled: true,
  capture: vi.fn(),
  flush: async () => undefined,
} satisfies ErrorReporter;

async function until(check: () => Promise<boolean>, timeoutMs = 15_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!(await check())) {
    if (Date.now() > deadline) throw new Error('condition not met in time');
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
}

describe.skipIf(!url)('job queue (Postgres)', () => {
  let pool: pg.Pool;
  let api: PgBoss;
  let worker: PgBoss | undefined;

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: url, max: 4 });
    await pool.query(
      'drop schema if exists pgboss cascade; drop schema public cascade; create schema public'
    );
    await migrate(
      pool,
      await loadMigrations(join(import.meta.dirname, '..', 'migrations')),
      { info: () => undefined }
    );
    api = await startBoss({ databaseUrl: url!, role: 'api', log });
  });

  afterAll(async () => {
    await worker?.stop({ graceful: false });
    await api?.stop({ graceful: false });
    await pool?.end();
  });

  it('creates every queue with the dead-letter queue attached', async () => {
    const queues = await api.getQueues([...QUEUES, DEAD_LETTER_QUEUE]);
    expect(queues.map((q) => q.name).sort()).toEqual(
      [...QUEUES, DEAD_LETTER_QUEUE].sort()
    );
    for (const q of queues.filter((q) => q.name !== DEAD_LETTER_QUEUE)) {
      expect(q.deadLetter).toBe(DEAD_LETTER_QUEUE);
    }
  });

  it('starting a second time is a no-op', async () => {
    const again = await startBoss({ databaseUrl: url!, role: 'api', log });
    await again.stop({ graceful: false });
  });

  it('counts waiting jobs live, without a running worker', async () => {
    expect(await queueDepth(pool)).toEqual({
      waiting: 0,
      active: 0,
      failed: 0,
      deadLetter: 0,
    });
    await api.send('imports', { probe: true });
    expect((await queueDepth(pool)).waiting).toBe(1);
    await api.deleteAllJobs('imports');
  });

  it('the worker prunes stale heartbeats and keeps fresh ones', async () => {
    await pool.query(
      `insert into service_heartbeats (role, instance, version, beat_at) values
         ('worker', 'old-container', 'sha-old', now() - interval '8 days'),
         ('worker', 'live-container', 'sha-new', now())`
    );
    worker = await startBoss({ databaseUrl: url!, role: 'worker', log });
    await registerMaintenance(worker, pool, log, errors);

    const schedules = await worker.getSchedules(MAINTENANCE_QUEUE);
    expect(schedules.map((s) => s.key)).toContain('prune-heartbeats');

    await api.send(MAINTENANCE_QUEUE, { task: 'prune-heartbeats' });
    await until(async () => {
      const { rows } = await pool.query('select instance from service_heartbeats');
      return rows.length === 1;
    });
    const { rows } = await pool.query('select instance from service_heartbeats');
    expect(rows).toEqual([{ instance: 'live-container' }]);
  });

  it('fails and reports unknown maintenance payloads instead of completing them', async () => {
    const id = await api.send(
      MAINTENANCE_QUEUE,
      { task: 'drop-everything' },
      { retryLimit: 0 }
    );
    await until(async () => {
      const [job] = await api.findJobs(MAINTENANCE_QUEUE, { id: id! });
      return job?.state === 'failed';
    });
    expect(errors.capture).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'ZodError' }),
      { queue: MAINTENANCE_QUEUE, jobId: id }
    );
  });
});
