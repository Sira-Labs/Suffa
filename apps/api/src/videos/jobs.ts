/**
 * `imports` queue (ADR-0012, ADR-0020): imports the videos of a channel's playlists from the
 * YouTube Data API, on demand and every night.
 */
import type { Job, PgBoss } from 'pg-boss';
import type { Logger } from 'pino';
import { z } from 'zod';
import type { QueueName } from '../jobs/queue.js';
import type { ErrorReporter } from '../observability/errors.js';
import type { PgVideoRepository } from './repository.js';
import { YouTubeError, type YouTubeClient } from './youtube.js';

export const IMPORTS_QUEUE: QueueName = 'imports';

export const ImportJob = z.discriminatedUnion('task', [
  z.object({ task: z.literal('youtube'), channelId: z.string().uuid() }),
  z.object({ task: z.literal('youtube-all') }),
]);

export const enqueueChannelImport =
  (boss: Pick<PgBoss, 'send'>) => async (channelId: string) => {
    await boss.send(
      IMPORTS_QUEUE,
      { task: 'youtube', channelId },
      { singletonKey: channelId }
    );
  };

export interface ImportDeps {
  videos: Pick<PgVideoRepository, 'channel' | 'channels' | 'upsertVideos' | 'markImport'>;
  youtube: Pick<YouTubeClient, 'playlist'>;
  log: Pick<Logger, 'info' | 'warn'>;
}

/** Imports every playlist of a channel; a YouTube error is recorded on the channel. */
export async function importChannel(
  deps: ImportDeps,
  channelId: string
): Promise<number> {
  const channel = await deps.videos.channel(channelId);
  if (!channel) return 0;
  let added = 0;
  try {
    for (const playlist of channel.playlists) {
      added += await deps.videos.upsertVideos(
        channelId,
        await deps.youtube.playlist(playlist)
      );
    }
    await deps.videos.markImport(channelId, null);
    deps.log.info({ channelId, added }, 'videos.imported');
    return added;
  } catch (error) {
    if (!(error instanceof YouTubeError)) throw error;
    await deps.videos.markImport(channelId, error.message);
    deps.log.warn({ channelId, status: error.status }, 'videos.import_failed');
    return added;
  }
}

export async function runImportJob(deps: ImportDeps, raw: unknown): Promise<void> {
  const job = ImportJob.parse(raw);
  if (job.task === 'youtube') {
    await importChannel(deps, job.channelId);
    return;
  }
  for (const channel of await deps.videos.channels())
    await importChannel(deps, channel.id);
}

export async function registerImports(
  boss: PgBoss,
  deps: ImportDeps,
  errors: ErrorReporter
): Promise<void> {
  await boss.schedule(
    IMPORTS_QUEUE,
    '41 2 * * *',
    { task: 'youtube-all' },
    {
      key: 'youtube-all',
      tz: 'UTC',
    }
  );
  await boss.work(
    IMPORTS_QUEUE,
    { batchSize: 1, localConcurrency: 1 },
    async (jobs: Job<unknown>[]) => {
      for (const job of jobs) {
        try {
          await runImportJob(deps, job.data);
        } catch (error) {
          errors.capture(error, { queue: IMPORTS_QUEUE, jobId: job.id });
          throw error;
        }
      }
    }
  );
}
