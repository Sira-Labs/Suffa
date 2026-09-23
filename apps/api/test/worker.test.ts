import { describe, expect, it, vi } from 'vitest';
import { pino } from 'pino';
import type { SqlPool } from '../src/migrate.js';
import { runWorker } from '../src/worker.js';

/** Fake pool: answers the revision queries and counts heartbeats. */
function fakePool(revision: string | null, onHeartbeat: () => void): SqlPool {
  return {
    connect: async () => ({
      release: () => undefined,
      query: async (text: string) => {
        if (text.includes('to_regclass')) return { rows: [{ present: true }] } as never;
        if (text.includes('schema_migrations'))
          return { rows: [{ id: revision }] } as never;
        if (text.includes('service_heartbeats')) onHeartbeat();
        return { rows: [] } as never;
      },
    }),
  };
}

const log = pino({ level: 'silent' });

describe('runWorker', () => {
  it('starts the job queue, beats, and drains the queue on shutdown', async () => {
    const shutdown = new AbortController();
    const stopJobs = vi.fn(async () => undefined);
    const startJobs = vi.fn(async () => stopJobs);
    let beats = 0;
    const pool = fakePool('0002_x', () => {
      beats += 1;
      shutdown.abort();
    });

    await runWorker({
      pool,
      startJobs,
      expectedRevision: '0002_x',
      version: 'sha-test',
      heartbeatMs: 10_000,
      log,
      signal: shutdown.signal,
    });

    expect(startJobs).toHaveBeenCalledOnce();
    expect(beats).toBe(1);
    expect(stopJobs).toHaveBeenCalledOnce();
  });

  it('does not start the queue when the schema revision does not match', async () => {
    const startJobs = vi.fn(async () => async () => undefined);
    await expect(
      runWorker({
        pool: fakePool('0001_x', () => undefined),
        startJobs,
        expectedRevision: '0002_x',
        version: 'sha-test',
        heartbeatMs: 10,
        log,
        signal: new AbortController().signal,
      })
    ).rejects.toMatchObject({ name: 'SchemaMismatchError' });
    expect(startJobs).not.toHaveBeenCalled();
  });

  it('still drains the queue when the heartbeat fails', async () => {
    const stopJobs = vi.fn(async () => undefined);
    const healthy = fakePool('0002_x', () => undefined);
    let connects = 0;
    // The first connection answers the revision check; then the database goes away.
    const pool: SqlPool = {
      connect: async () => {
        connects += 1;
        if (connects > 1) throw new Error('ECONNRESET');
        return healthy.connect();
      },
    };

    await expect(
      runWorker({
        pool,
        startJobs: async () => stopJobs,
        expectedRevision: '0002_x',
        version: 'sha-test',
        heartbeatMs: 10,
        log,
        signal: new AbortController().signal,
      })
    ).rejects.toThrow('ECONNRESET');
    expect(stopJobs).toHaveBeenCalledOnce();
  });
});
