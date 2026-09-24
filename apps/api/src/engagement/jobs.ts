/**
 * `engagement` queue (ADR-0020): after a push, the worker recomputes the learner's XP,
 * quests and badges. Pushes come in bursts (one per table), so jobs are debounced per
 * learner: one recompute shortly after the last push.
 */
import type { Job, PgBoss } from 'pg-boss';
import type { Logger } from 'pino';
import { z } from 'zod';
import type { QueueName } from '../jobs/queue.js';
import type { ErrorReporter } from '../observability/errors.js';
import { recomputeEngagement } from './recompute.js';
import type { EngagementRepository } from './repository.js';

export const ENGAGEMENT_QUEUE: QueueName = 'engagement';
/** Wait this long after a push before recomputing (later pushes move it). */
export const RECOMPUTE_DEBOUNCE_SECONDS = 20;

export const EngagementJob = z.object({ userId: z.string().uuid() });

/** Asks the worker to recompute a learner's engagement (used by the sync push). */
export function requestRecompute(boss: Pick<PgBoss, 'sendDebounced'>) {
  return async (userId: string): Promise<void> => {
    await boss.sendDebounced(
      ENGAGEMENT_QUEUE,
      { userId },
      null,
      RECOMPUTE_DEBOUNCE_SECONDS,
      userId
    );
  };
}

/** Registers the recompute handler on a worker's pg-boss instance. */
export async function registerEngagement(
  boss: PgBoss,
  repo: EngagementRepository,
  log: Pick<Logger, 'info'>,
  errors: ErrorReporter
): Promise<void> {
  await boss.work(ENGAGEMENT_QUEUE, async (jobs: Job<unknown>[]) => {
    for (const job of jobs) {
      try {
        const { userId } = EngagementJob.parse(job.data);
        await recomputeEngagement(repo, userId, log);
      } catch (error) {
        // Reported on every attempt; pg-boss still retries and finally dead-letters it.
        errors.capture(error, { queue: ENGAGEMENT_QUEUE, jobId: job.id });
        throw error;
      }
    }
  });
}
