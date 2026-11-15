/**
 * How long a live room and its join tokens last (ADR-0026, live/lifetime.ts): the token
 * lifetime, the sweep with a fake repository and room service, and the maintenance task.
 */
import { describe, expect, it } from 'vitest';
import {
  MAINTENANCE_SCHEDULES,
  runMaintenance,
  type MaintenanceJob,
} from '../src/jobs/maintenance.js';
import {
  latestEnd,
  liveRoomSweep,
  LiveRoomSweepError,
  MIN_TOKEN_SECONDS,
  roomName,
  sessionOfRoom,
  tokenSeconds,
} from '../src/live/lifetime.js';
import type { SqlPool } from '../src/migrate.js';

const start = new Date('2026-11-16T17:00:00Z');
const after = (minutes: number) => new Date(start.getTime() + minutes * 60_000);

describe('join token lifetime', () => {
  it('ends with the session at the latest: its length plus the hour of overrun', () => {
    expect(latestEnd(start, 60)).toEqual(after(120));
    expect(tokenSeconds(start, 60, start)).toBe(120 * 60);
    expect(tokenSeconds(start, 60, after(45))).toBe(75 * 60);
  });

  it('is never shorter than the time it takes to connect', () => {
    expect(tokenSeconds(start, 60, after(119))).toBe(MIN_TOKEN_SECONDS);
    expect(tokenSeconds(start, 60, after(500))).toBe(MIN_TOKEN_SECONDS);
  });
});

describe('live room sweep', () => {
  const A = '00000000-0000-4000-8000-00000000000a';
  const B = '00000000-0000-4000-8000-00000000000b';
  const C = '00000000-0000-4000-8000-00000000000c';

  function setup(existing: string[], live: string[], failing: string[] = []) {
    const order: string[] = [];
    const sweep = liveRoomSweep(
      {
        endOverrun: async () => {
          order.push('end');
          return 1;
        },
        liveAmong: async (ids) => {
          order.push(`live?${ids.length}`);
          return new Set(live);
        },
      },
      {
        list: async () => {
          order.push('list');
          return existing;
        },
        close: async (room) => {
          if (failing.includes(room)) throw new TypeError('fetch failed');
          order.push(`close:${room}`);
        },
      }
    );
    return { order, sweep };
  }

  it('knows which rooms are ours', () => {
    expect(roomName(A)).toBe(`live-${A}`);
    expect(sessionOfRoom(`live-${A}`)).toBe(A);
    expect(sessionOfRoom('live-not-a-session')).toBeNull();
    expect(sessionOfRoom(A)).toBeNull();
    expect(sessionOfRoom('')).toBeNull();
  });

  it('ends overrun sessions first, then closes our rooms whose session is not live', async () => {
    const { order, sweep } = setup([`live-${A}`, `live-${B}`, 'other-room'], [A]);
    expect(await sweep.run(start)).toEqual({ ended: 1, closed: 1 });
    // Asked about the two rooms of ours only; the live one and the foreign one are left.
    expect(order).toEqual(['end', 'list', 'live?2', `close:live-${B}`]);
  });

  it('goes on after a room that cannot be closed and fails the job at the end', async () => {
    const { order, sweep } = setup(
      [`live-${A}`, `live-${B}`, `live-${C}`],
      [],
      [`live-${A}`]
    );
    const run = sweep.run(start);
    await expect(run).rejects.toBeInstanceOf(LiveRoomSweepError);
    await expect(run).rejects.toMatchObject({ result: { ended: 1, closed: 2 } });
    expect(order.slice(3)).toEqual([`close:live-${B}`, `close:live-${C}`]);
  });
});

describe('close-live-rooms', () => {
  const pool = {} as SqlPool;

  it('runs every five minutes', () => {
    expect(MAINTENANCE_SCHEDULES).toContainEqual({
      cron: '*/5 * * * *',
      job: { task: 'close-live-rooms' } satisfies MaintenanceJob,
    });
  });

  it('sweeps and logs only when something was ended or closed', async () => {
    const logged: unknown[] = [];
    const log = { info: (entry: unknown) => logged.push(entry) };
    const run = (result: { ended: number; closed: number }) =>
      runMaintenance(pool, { task: 'close-live-rooms' }, log, undefined, undefined, {
        run: async () => result,
      });
    await run({ ended: 0, closed: 0 });
    expect(logged).toEqual([]);
    await run({ ended: 1, closed: 2 });
    expect(logged).toEqual([{ task: 'close-live-rooms', ended: 1, closed: 2 }]);
  });

  it('does nothing on a worker without the LiveKit settings', async () => {
    await expect(
      runMaintenance(pool, { task: 'close-live-rooms' }, { info: () => undefined })
    ).resolves.toBeUndefined();
  });
});
