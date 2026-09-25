/**
 * `media` queue (ADR-0020): transcoding recordings. One job at a time per worker and long
 * expiry (a lesson of an hour takes minutes), so the shared server stays responsive.
 */
import type { Job, PgBoss } from 'pg-boss';
import type { Logger } from 'pino';
import { z } from 'zod';
import type { QueueName } from '../jobs/queue.js';
import type { ErrorReporter } from '../observability/errors.js';
import type { ObjectStorage } from '../storage/objectStorage.js';
import type { MediaRepository } from './repository.js';
import { processRecording, type Transcoder } from './service.js';

export const MEDIA_QUEUE: QueueName = 'media';
/** A job may run this long before pg-boss considers it stuck. */
export const TRANSCODE_EXPIRE_SECONDS = 4 * 60 * 60;

export const MediaJob = z.object({
  task: z.literal('transcode'),
  mediaId: z.string().uuid(),
});

export function enqueueTranscode(boss: Pick<PgBoss, 'send'>) {
  return async (mediaId: string) => {
    await boss.send(
      MEDIA_QUEUE,
      { task: 'transcode', mediaId },
      { expireInSeconds: TRANSCODE_EXPIRE_SECONDS, singletonKey: mediaId }
    );
  };
}

export async function registerMedia(
  boss: PgBoss,
  deps: {
    repo: MediaRepository;
    storage: ObjectStorage;
    transcoder: Transcoder;
    log: Pick<Logger, 'info' | 'warn'>;
  },
  errors: ErrorReporter
): Promise<void> {
  await boss.work(
    MEDIA_QUEUE,
    { batchSize: 1, localConcurrency: 1 },
    async (jobs: Job<unknown>[]) => {
      for (const job of jobs) {
        try {
          const { mediaId } = MediaJob.parse(job.data);
          await processRecording(
            deps.repo,
            deps.storage,
            deps.transcoder,
            mediaId,
            deps.log
          );
        } catch (error) {
          errors.capture(error, { queue: MEDIA_QUEUE, jobId: job.id });
          throw error;
        }
      }
    }
  );
}
