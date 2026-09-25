/**
 * When a reminder may go out (engagement plan §5), pure: at the learner's chosen local time,
 * never in quiet hours, at most once a day, and not when today's learning is already done.
 */
import { dayKey } from '@suffa/engagement';

/** The worker checks every 15 minutes; a reminder goes out in the first check after its time. */
export const REMINDER_WINDOW_MINUTES = 15;

/** "18:30" → 1110. */
export function minutesOf(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number) as [number, number];
  return h * 60 + m;
}

/** Local day and minute of the day in a time zone. */
export function localClock(
  now: Date,
  timeZone: string
): { day: string; minutes: number } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone,
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(now)
      .map((p) => [p.type, p.value])
  );
  return {
    day: dayKey(now, timeZone),
    minutes: Number(parts.hour) * 60 + Number(parts.minute),
  };
}

/** Quiet hours may wrap midnight (22:00–07:00). Equal start and end means none. */
export function inQuietHours(minutes: number, start: string, end: string): boolean {
  const s = minutesOf(start);
  const e = minutesOf(end);
  if (s === e) return false;
  return s < e ? minutes >= s && minutes < e : minutes >= s || minutes < e;
}

export interface ReminderPrefs {
  reminderTime: string;
  quietStart: string;
  quietEnd: string;
}

/** Is `now` the moment for today's reminder (before the log and "done" checks)? */
export function reminderDue(prefs: ReminderPrefs, now: Date, timeZone: string): boolean {
  const { minutes } = localClock(now, timeZone);
  const at = minutesOf(prefs.reminderTime);
  const inWindow = minutes >= at && minutes < at + REMINDER_WINDOW_MINUTES;
  return inWindow && !inQuietHours(minutes, prefs.quietStart, prefs.quietEnd);
}

/** Short, encouraging, never guilt (engagement plan §5). */
export function reminderMessage(streak: number): { title: string; body: string } {
  return streak > 0
    ? {
        title: `${streak} ${streak === 1 ? 'Tag' : 'Tage'} in Folge 🌱`,
        body: '٥ دقائق فقط – 5 Minuten reichen, um deine Serie heute fortzusetzen.',
      }
    : {
        title: 'Zeit für Arabisch 🌱',
        body: '٥ دقائق فقط – 5 Minuten, eine Tagesaufgabe, und der Tag zählt.',
      };
}
