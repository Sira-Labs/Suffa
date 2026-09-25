/**
 * `media` queue (ADR-0020): transcoding recordings and importing them from Google Drive.
 * One job at a time per worker and long expiry (a lesson of an hour takes minutes), so the
 * shared server stays responsive.
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

export const MediaJob = z.discriminatedUnion('task', [
  z.object({ task: z.literal('transcode'), mediaId: z.string().uuid() }),
  z.object({ task: z.literal('import'), mediaId: z.string().uuid() }),
  z.object({ task: z.literal('transcribe'), mediaId: z.string().uuid() }),
  z.object({ task: z.literal('suggest'), mediaId: z.string().uuid() }),
]);

function enqueue(
  boss: Pick<PgBoss, 'send'>,
  task: 'transcode' | 'import' | 'transcribe' | 'suggest'
) {
  return async (mediaId: string) => {
    await boss.send(
      MEDIA_QUEUE,
      { task, mediaId },
      { expireInSeconds: TRANSCODE_EXPIRE_SECONDS, singletonKey: mediaId }
    );
  };
}

export const enqueueTranscode = (boss: Pick<PgBoss, 'send'>) =>
  enqueue(boss, 'transcode');
/** Drive import: copy from Drive, then transcode, in one job (story 7.2). */
export const enqueueImport = (boss: Pick<PgBoss, 'send'>) => enqueue(boss, 'import');
/** Transcription of a ready recording (story 8.1). */
export const enqueueTranscribe = (boss: Pick<PgBoss, 'send'>) =>
  enqueue(boss, 'transcribe');
/** AI chapter and checkpoint suggestions from the transcript (story 11.4). */
export const enqueueSuggest = (boss: Pick<PgBoss, 'send'>) => enqueue(boss, 'suggest');

export interface MediaJobDeps {
  repo: MediaRepository;
  storage: ObjectStorage;
  transcoder: Transcoder;
  log: Pick<Logger, 'info' | 'warn'>;
  /** Runs a Drive import; absent when Drive is not configured. */
  importFromDrive?: (mediaId: string) => Promise<void>;
  /** Transcribes a recording; absent when no transcription service is configured. */
  transcribe?: (mediaId: string) => Promise<void>;
  /** Called when a recording became ready (queues its transcription). */
  onReady?: (mediaId: string) => Promise<void>;
  /** Suggests chapters and checkpoints; absent when no model is configured. */
  suggest?: (mediaId: string) => Promise<void>;
}

export async function runMediaJob(deps: MediaJobDeps, raw: unknown): Promise<void> {
  const task = MediaJob.parse(raw);
  if (task.task === 'suggest') {
    if (!deps.suggest) throw new Error('no model is configured for suggestions');
    await deps.suggest(task.mediaId);
    return;
  }
  if (task.task === 'transcribe') {
    if (!deps.transcribe) throw new Error('no transcription service is configured');
    await deps.transcribe(task.mediaId);
    return;
  }
  if (task.task === 'import') {
    if (!deps.importFromDrive) throw new Error('Google Drive is not configured');
    await deps.importFromDrive(task.mediaId);
  } else {
    await processRecording(
      deps.repo,
      deps.storage,
      deps.transcoder,
      task.mediaId,
      deps.log
    );
  }
  if ((await deps.repo.byId(task.mediaId))?.status === 'ready') {
    await deps.onReady?.(task.mediaId);
  }
}

export async function registerMedia(
  boss: PgBoss,
  deps: MediaJobDeps,
  errors: ErrorReporter
): Promise<void> {
  await boss.work(
    MEDIA_QUEUE,
    { batchSize: 1, localConcurrency: 1 },
    async (jobs: Job<unknown>[]) => {
      for (const job of jobs) {
        try {
          await runMediaJob(deps, job.data);
        } catch (error) {
          errors.capture(error, { queue: MEDIA_QUEUE, jobId: job.id });
          throw error;
        }
      }
    }
  );
}
