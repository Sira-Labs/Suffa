import { describe, expect, it, vi } from 'vitest';
import type { PgBoss } from 'pg-boss';
import {
  ENGAGEMENT_QUEUE,
  RECOMPUTE_DEBOUNCE_SECONDS,
  registerEngagement,
  requestRecompute,
} from '../src/engagement/jobs.js';
import type { EngagementRepository } from '../src/engagement/repository.js';

const USER = '00000000-0000-4000-8000-00000000000a';
const quiet = { info: () => undefined };

describe('engagement jobs', () => {
  it('debounces one recompute per learner', async () => {
    const sendDebounced = vi.fn(async () => 'job-1');
    await requestRecompute({ sendDebounced } as unknown as PgBoss)(USER);
    expect(sendDebounced).toHaveBeenCalledWith(
      ENGAGEMENT_QUEUE,
      { userId: USER },
      null,
      RECOMPUTE_DEBOUNCE_SECONDS,
      USER
    );
  });

  it('recomputes on a job and reports bad payloads before pg-boss retries them', async () => {
    let handler: ((jobs: { id: string; data: unknown }[]) => Promise<void>) | undefined;
    const boss = {
      work: vi.fn(async (_queue: string, fn: typeof handler) => {
        handler = fn;
      }),
    } as unknown as PgBoss;
    const repo: EngagementRepository = {
      load: vi.fn(async () => null),
      save: vi.fn(),
      state: vi.fn(),
    };
    const capture = vi.fn();
    await registerEngagement(boss, repo, quiet, {
      enabled: false,
      capture,
      flush: async () => true,
    } as never);
    await handler!([{ id: 'j1', data: { userId: USER } }]);
    expect(repo.load).toHaveBeenCalledWith(USER);
    await expect(handler!([{ id: 'j2', data: { userId: 'nope' } }])).rejects.toThrow();
    expect(capture).toHaveBeenCalledWith(expect.anything(), {
      queue: ENGAGEMENT_QUEUE,
      jobId: 'j2',
    });
  });
});
