/**
 * The maintenance task that picks up live recordings whose worker step was lost (ADR-0029).
 */
import { describe, expect, it } from 'vitest';
import {
  MAINTENANCE_SCHEDULES,
  runMaintenance,
  type MaintenanceJob,
} from '../src/jobs/maintenance.js';
import type { SqlPool } from '../src/migrate.js';

const quiet = { info: () => undefined };
// The task never touches the database itself.
const pool = {} as SqlPool;

describe('resume-recordings', () => {
  it('runs every five minutes', () => {
    expect(MAINTENANCE_SCHEDULES).toContainEqual({
      cron: '*/5 * * * *',
      job: { task: 'resume-recordings' } satisfies MaintenanceJob,
    });
  });

  it('follows the lost recordings again and logs how many', async () => {
    const logged: unknown[] = [];
    let calls = 0;
    await runMaintenance(
      pool,
      { task: 'resume-recordings' },
      { info: (entry: unknown) => logged.push(entry) },
      undefined,
      {
        resume: async () => {
          calls += 1;
          return 2;
        },
      }
    );
    expect(calls).toBe(1);
    expect(logged).toEqual([{ task: 'resume-recordings', resumed: 2 }]);
  });

  it('does nothing on a worker without the recording settings', async () => {
    await expect(
      runMaintenance(pool, { task: 'resume-recordings' }, quiet)
    ).resolves.toBeUndefined();
  });
});
