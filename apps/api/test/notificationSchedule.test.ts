import { describe, expect, it, vi } from 'vitest';
import webpush from 'web-push';
import {
  inQuietHours,
  localClock,
  minutesOf,
  reminderDue,
  reminderMessage,
} from '../src/notifications/schedule.js';
import { WebPushNotifier } from '../src/notifications/notifier.js';
import { recapWeekDue } from '../src/notifications/recap.js';
import { NotificationJob, runNotificationJob } from '../src/notifications/jobs.js';

const prefs = { reminderTime: '18:00', quietStart: '22:00', quietEnd: '07:00' };

describe('reminder schedule', () => {
  it('reads local time in the learner time zone', () => {
    expect(localClock(new Date('2026-09-24T16:05:00Z'), 'Europe/Zurich')).toEqual({
      day: '2026-09-24',
      minutes: 18 * 60 + 5,
    });
    expect(minutesOf('07:30')).toBe(450);
  });

  it('handles quiet hours across midnight, within a day, or none', () => {
    expect(inQuietHours(minutesOf('23:00'), '22:00', '07:00')).toBe(true);
    expect(inQuietHours(minutesOf('06:59'), '22:00', '07:00')).toBe(true);
    expect(inQuietHours(minutesOf('07:00'), '22:00', '07:00')).toBe(false);
    expect(inQuietHours(minutesOf('13:30'), '13:00', '14:00')).toBe(true);
    expect(inQuietHours(minutesOf('15:00'), '13:00', '14:00')).toBe(false);
    expect(inQuietHours(minutesOf('03:00'), '00:00', '00:00')).toBe(false);
  });

  it('is due in the 15 minutes after the chosen local time, never in quiet hours', () => {
    const at = (iso: string) => reminderDue(prefs, new Date(iso), 'Europe/Zurich');
    expect(at('2026-09-24T15:59:00Z')).toBe(false); // 17:59
    expect(at('2026-09-24T16:00:00Z')).toBe(true); // 18:00
    expect(at('2026-09-24T16:14:00Z')).toBe(true);
    expect(at('2026-09-24T16:15:00Z')).toBe(false);
    const late = { ...prefs, reminderTime: '22:30' };
    expect(reminderDue(late, new Date('2026-09-24T20:30:00Z'), 'Europe/Zurich')).toBe(
      false
    );
  });

  it('writes encouraging messages', () => {
    expect(reminderMessage(0).title).toMatch(/Zeit für Arabisch/);
    expect(reminderMessage(1).title).toMatch(/^1 Tag in Folge/);
    expect(reminderMessage(12).title).toMatch(/^12 Tage in Folge/);
    expect(reminderMessage(12).body).not.toMatch(/verpasst|verloren/i);
  });

  it('knows when a weekly recap is due (Sunday from 18:00 local)', () => {
    expect(recapWeekDue(new Date('2026-09-27T16:30:00Z'), 'Europe/Zurich')).toBe(
      '2026-09-21'
    );
    expect(recapWeekDue(new Date('2026-09-27T15:30:00Z'), 'Europe/Zurich')).toBeNull();
    expect(recapWeekDue(new Date('2026-09-26T19:00:00Z'), 'Europe/Zurich')).toBeNull();
  });
});

describe('WebPushNotifier', () => {
  const target = { endpoint: 'https://push.example/1', p256dh: 'k', auth: 'a' };
  const message = { title: 't', body: 'b', url: '/', tag: 'x' };
  const vapid = { publicKey: 'p', privateKey: 's', subject: 'mailto:a@example.org' };
  const error = (status: number) =>
    new webpush.WebPushError('push failed', status, {}, '', target.endpoint);

  it('sends with VAPID and tells expired devices from failures', async () => {
    const sendNotification = vi.fn(async () => ({}) as never);
    const notifier = new WebPushNotifier(vapid, { sendNotification });
    expect(await notifier.send(target, message)).toBe('sent');
    expect(sendNotification).toHaveBeenCalledWith(
      { endpoint: target.endpoint, keys: { p256dh: 'k', auth: 'a' } },
      JSON.stringify(message),
      expect.objectContaining({ vapidDetails: vapid })
    );
    sendNotification.mockRejectedValueOnce(error(410));
    expect(await notifier.send(target, message)).toBe('gone');
    sendNotification.mockRejectedValueOnce(error(404));
    expect(await notifier.send(target, message)).toBe('gone');
    sendNotification.mockRejectedValueOnce(error(500));
    expect(await notifier.send(target, message)).toBe('failed');
    sendNotification.mockRejectedValueOnce(new TypeError('bug'));
    await expect(notifier.send(target, message)).rejects.toThrow(TypeError);
  });
});

describe('notification jobs', () => {
  it('accepts only known tasks', async () => {
    expect(NotificationJob.safeParse({ task: 'spam-everyone' }).success).toBe(false);
    await expect(
      runNotificationJob(
        {
          notifications: {} as never,
          recaps: {} as never,
          notifier: { enabled: false, send: vi.fn() },
          log: { info: () => undefined },
        },
        { task: 'reminders' }
      )
    ).resolves.toBeUndefined();
  });
});
