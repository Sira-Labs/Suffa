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
import {
  NOTIFICATION_SCHEDULES,
  NotificationJob,
  runNotificationJob,
} from '../src/notifications/jobs.js';
import {
  LIVE_REMINDER_LEAD_MINUTES,
  LiveReminderDeliveryError,
  liveReminderMessage,
  runLiveReminders,
  type DueLiveSession,
  type LiveReminderRecipient,
} from '../src/live/reminders.js';
import type { PushMessage } from '../src/notifications/notifier.js';

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
          liveReminders: {} as never,
          notifier: { enabled: false, send: vi.fn() },
          log: { info: () => undefined },
        },
        { task: 'reminders' }
      )
    ).resolves.toBeUndefined();
  });

  it('looks for live lessons about to start every five minutes', () => {
    expect(NOTIFICATION_SCHEDULES).toContainEqual({
      cron: '*/5 * * * *',
      job: { task: 'live-reminders' },
    });
  });
});

describe('live lesson reminders', () => {
  // 16:50 UTC = 18:50 in Zurich = 19:50 in Riyadh; the lesson starts ten minutes later.
  const now = new Date('2026-11-16T16:50:00Z');
  const session: DueLiveSession = {
    id: 'session-1',
    classId: 'class-1',
    className: 'Bayna Yadayk 1',
    title: 'Lektion 4',
    startsAt: new Date('2026-11-16T17:00:00Z'),
  };
  const member = (userId: string, over: Partial<LiveReminderRecipient> = {}) => ({
    userId,
    timeZone: 'Europe/Zurich',
    quietStart: '22:00',
    quietEnd: '07:00',
    ...over,
  });
  const quiet = { info: () => undefined };

  function setup(recipients: LiveReminderRecipient[], enabled = true) {
    const sent: { userId: string; message: PushMessage }[] = [];
    const repo = {
      claimDue: vi.fn(async () => [session]),
      recipients: vi.fn(async () => recipients),
    };
    const notifications = {
      targets: async (userId: string) => [{ endpoint: userId, p256dh: '', auth: '' }],
      delivered: async () => undefined,
    };
    const notifier = {
      enabled,
      send: async (target: { endpoint: string }, message: PushMessage) => {
        sent.push({ userId: target.endpoint, message });
        return 'sent' as const;
      },
    };
    return { sent, repo, notifications, notifier };
  }

  it('names the lesson, the class and the start in the member time zone', () => {
    expect(liveReminderMessage(session, 'Europe/Zurich')).toEqual({
      title: 'Gleich live: Lektion 4',
      body: 'Bayna Yadayk 1 · Beginn um 18:00 Uhr',
      url: '/classes/class-1',
      tag: 'live-session-1',
    });
    expect(liveReminderMessage(session, 'Asia/Riyadh').body).toContain('20:00 Uhr');
  });

  it('reaches every member it is for, but nobody in their quiet hours', async () => {
    const t = setup([
      member('amina'),
      member('bilal', {
        timeZone: 'Asia/Riyadh',
        quietStart: '19:30',
        quietEnd: '06:00',
      }),
    ]);
    expect(
      await runLiveReminders(t.repo, t.notifications, t.notifier, quiet, now)
    ).toEqual({ sessions: 1, sent: 1, quiet: 1, failed: 0, sessionsFailed: 0 });
    expect(t.repo.claimDue).toHaveBeenCalledWith(now, LIVE_REMINDER_LEAD_MINUTES);
    expect(t.sent.map((s) => s.userId)).toEqual(['amina']);
  });

  it('claims nothing while push is not set up', async () => {
    const t = setup([member('amina')], false);
    expect(
      await runLiveReminders(t.repo, t.notifications, t.notifier, quiet, now)
    ).toEqual({ sessions: 0, sent: 0, quiet: 0, failed: 0, sessionsFailed: 0 });
    expect(t.repo.claimDue).not.toHaveBeenCalled();
  });

  it('goes on with the next lesson when the members of one cannot be read', async () => {
    const t = setup([member('amina')]);
    const second = { ...session, id: 'session-2' };
    t.repo.claimDue.mockResolvedValue([session, second]);
    t.repo.recipients.mockRejectedValueOnce(new Error('connection terminated'));
    const run = runLiveReminders(t.repo, t.notifications, t.notifier, quiet, now);
    await expect(run).rejects.toMatchObject({
      result: { sessions: 2, sent: 1, quiet: 0, failed: 0, sessionsFailed: 1 },
    });
    expect(t.sent.map((s) => s.message.tag)).toEqual(['live-session-2']);
  });

  it('goes on after a delivery that throws and fails the job at the end', async () => {
    const t = setup([member('amina'), member('bilal'), member('chadija')]);
    const send = t.notifier.send;
    t.notifier.send = async (target, message) => {
      if (target.endpoint === 'bilal') throw new TypeError('fetch failed');
      return send(target, message);
    };
    const run = runLiveReminders(t.repo, t.notifications, t.notifier, quiet, now);
    await expect(run).rejects.toBeInstanceOf(LiveReminderDeliveryError);
    await expect(run).rejects.toMatchObject({
      result: { sessions: 1, sent: 2, quiet: 0, failed: 1, sessionsFailed: 0 },
    });
    expect(t.sent.map((s) => s.userId)).toEqual(['amina', 'chadija']);
  });
});
