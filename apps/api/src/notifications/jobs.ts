/**
 * `notifications` queue (ADR-0020): reminders every 15 minutes, weekly recaps hourly. Both
 * decide per learner in their own time zone, so one schedule serves every zone.
 */
import type { Job, PgBoss } from 'pg-boss';
import type { Logger } from 'pino';
import { z } from 'zod';
import type { QueueName } from '../jobs/queue.js';
import type { ErrorReporter } from '../observability/errors.js';
import type { Notifier } from './notifier.js';
import { runWeeklyRecaps, type RecapRepository } from './recap.js';
import { runReminders } from './reminders.js';
import type { NotificationRepository } from './repository.js';

export const NOTIFICATIONS_QUEUE: QueueName = 'notifications';

export const NotificationJob = z.discriminatedUnion('task', [
  z.object({ task: z.literal('reminders') }),
  z.object({ task: z.literal('weekly-recaps') }),
]);
export type NotificationJob = z.infer<typeof NotificationJob>;

export const NOTIFICATION_SCHEDULES: ReadonlyArray<{
  cron: string;
  job: NotificationJob;
}> = [
  { cron: '*/15 * * * *', job: { task: 'reminders' } },
  { cron: '5 * * * *', job: { task: 'weekly-recaps' } },
];

export interface NotificationJobDeps {
  notifications: NotificationRepository;
  recaps: RecapRepository;
  notifier: Notifier;
  log: Pick<Logger, 'info'>;
}

export async function runNotificationJob(
  deps: NotificationJobDeps,
  raw: unknown,
  now: Date = new Date()
): Promise<void> {
  const job = NotificationJob.parse(raw);
  switch (job.task) {
    case 'reminders':
      await runReminders(deps.notifications, deps.notifier, deps.log, now);
      return;
    case 'weekly-recaps':
      await runWeeklyRecaps(
        deps.recaps,
        deps.notifications,
        deps.notifier,
        deps.log,
        now
      );
      return;
  }
}

export async function registerNotifications(
  boss: PgBoss,
  deps: NotificationJobDeps,
  errors: ErrorReporter
): Promise<void> {
  for (const { cron, job } of NOTIFICATION_SCHEDULES) {
    await boss.schedule(NOTIFICATIONS_QUEUE, cron, job, { key: job.task, tz: 'UTC' });
  }
  await boss.work(NOTIFICATIONS_QUEUE, async (jobs: Job<unknown>[]) => {
    for (const job of jobs) {
      try {
        await runNotificationJob(deps, job.data);
      } catch (error) {
        errors.capture(error, { queue: NOTIFICATIONS_QUEUE, jobId: job.id });
        throw error;
      }
    }
  });
}
