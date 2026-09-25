/**
 * Daily reminders (story 6.3): run every 15 minutes by the worker. At most one per learner
 * and local day, only at their chosen time, never in quiet hours, and not when a daily
 * quest is already done today (as far as the server knows from the last sync).
 */
import type { Logger } from 'pino';
import type { Notifier, PushMessage } from './notifier.js';
import type { NotificationRepository, Recipient } from './repository.js';
import { localClock, reminderDue, reminderMessage } from './schedule.js';

/** Sends `message` to every device of a learner; returns how many received it. */
export async function deliver(
  repo: NotificationRepository,
  notifier: Notifier,
  userId: string,
  message: PushMessage
): Promise<number> {
  let sent = 0;
  for (const target of await repo.targets(userId)) {
    const result = await notifier.send(target, message);
    await repo.delivered(target.endpoint, result);
    if (result === 'sent') sent++;
  }
  return sent;
}

export async function runReminders(
  repo: NotificationRepository,
  notifier: Notifier,
  log: Pick<Logger, 'info'>,
  now: Date = new Date()
): Promise<{ sent: number; skippedDone: number }> {
  if (!notifier.enabled) return { sent: 0, skippedDone: 0 };
  let sent = 0;
  let skippedDone = 0;
  for (const r of await repo.recipients('reminders')) {
    if (!reminderDue(r.prefs, now, r.timeZone)) continue;
    const { day } = localClock(now, r.timeZone);
    if (await repo.doneOn(r.userId, day)) {
      skippedDone++;
      continue;
    }
    // Claim before sending: a crash may lose a reminder but never sends two.
    if (!(await repo.claim(r.userId, 'reminder', day))) continue;
    if ((await deliver(repo, notifier, r.userId, reminder(r))) > 0) sent++;
  }
  log.info({ sent, skippedDone }, 'notifications.reminders');
  return { sent, skippedDone };
}

function reminder(r: Recipient): PushMessage {
  return { ...reminderMessage(r.streak), url: '/', tag: 'daily-reminder' };
}
