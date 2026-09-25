/**
 * The daily reminder scheduled on the device (ADR-0019) for app installs without server push
 * (no FCM configured): works offline and needs no server. The next week is scheduled ahead,
 * so reminders keep coming when the app is not opened; each start and each finished day
 * re-plans it, skipping today once today's learning is done. Quiet hours are respected.
 */
import { logger } from '@/services/logger';
import type { NotificationPrefs } from '@/services/notifications/notificationsApi';
import { plugin, type LocalNotificationsPlugin } from './capacitor';

const log = logger.child('native:reminders');

/** Notification ids 7001…7007, one per planned day. */
const FIRST_ID = 7001;
const DAYS_AHEAD = 7;
const PREFS_KEY = 'suffa.localReminder';

export type ReminderPlan = Pick<
  NotificationPrefs,
  'reminderEnabled' | 'reminderTime' | 'quietStart' | 'quietEnd'
>;

function minutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

/** Whether a time of day falls in quiet hours (which may wrap past midnight). */
export function inQuietHours(
  time: string,
  quietStart: string,
  quietEnd: string
): boolean {
  const t = minutes(time);
  const start = minutes(quietStart);
  const end = minutes(quietEnd);
  if (start === end) return false;
  return start < end ? t >= start && t < end : t >= start || t < end;
}

/** When the next reminders fire, in the device's local time. */
export function reminderTimes(plan: ReminderPlan, now: Date, doneToday: boolean): Date[] {
  if (!plan.reminderEnabled) return [];
  if (inQuietHours(plan.reminderTime, plan.quietStart, plan.quietEnd)) return [];
  const [hour, minute] = plan.reminderTime.split(':').map(Number);
  const times: Date[] = [];
  for (let day = 0; day < DAYS_AHEAD + 1 && times.length < DAYS_AHEAD; day++) {
    const at = new Date(now);
    at.setDate(now.getDate() + day);
    at.setHours(hour ?? 0, minute ?? 0, 0, 0);
    if (at <= now || (day === 0 && doneToday)) continue;
    times.push(at);
  }
  return times;
}

function savedPlan(): ReminderPlan | null {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    return raw ? (JSON.parse(raw) as ReminderPlan) : null;
  } catch (error) {
    log.debug('no saved reminder plan', { error: String(error) });
    return null;
  }
}

export interface LocalReminders {
  /** Asks for permission; false when the learner declines. */
  permit(): Promise<boolean>;
  /** Replaces the planned reminders (none when `plan` is off). */
  plan(
    plan: ReminderPlan,
    options?: { doneToday?: boolean; now?: Date }
  ): Promise<number>;
  /** Re-plans from the last saved plan, e.g. at start or when the day's quests are done. */
  replan(options?: { doneToday?: boolean; now?: Date }): Promise<number>;
}

export function createLocalReminders(
  notifications: LocalNotificationsPlugin | null = plugin<LocalNotificationsPlugin>(
    'LocalNotifications'
  )
): LocalReminders | null {
  if (!notifications) return null;
  const self: LocalReminders = {
    async permit() {
      return (await notifications.requestPermissions()).display === 'granted';
    },
    async plan(plan, options = {}) {
      localStorage.setItem(PREFS_KEY, JSON.stringify(plan));
      await notifications.cancel({
        notifications: Array.from({ length: DAYS_AHEAD }, (_, i) => ({
          id: FIRST_ID + i,
        })),
      });
      const times = reminderTimes(
        plan,
        options.now ?? new Date(),
        options.doneToday ?? false
      );
      if (times.length === 0) return 0;
      await notifications.schedule({
        notifications: times.map((at, i) => ({
          id: FIRST_ID + i,
          title: 'Zeit für Arabisch',
          body: 'Ein paar Minuten heute halten deine Serie am Leben.',
          schedule: { at, allowWhileIdle: true },
        })),
      });
      log.info('reminders planned', { count: times.length });
      return times.length;
    },
    async replan(options = {}) {
      const plan = savedPlan();
      return plan ? self.plan(plan, options) : 0;
    },
  };
  return self;
}
