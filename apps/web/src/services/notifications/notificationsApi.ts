/**
 * Reminders and the weekly recap (stories 6.3, 6.4): the server's settings and this
 * device's push subscription.
 */
import { apiRequest, type Fetch } from '@/services/api/request';

export interface NotificationPrefs {
  reminderEnabled: boolean;
  reminderTime: string;
  quietStart: string;
  quietEnd: string;
  weeklyRecap: boolean;
}

export interface NotificationConfig {
  /** VAPID key for subscribing; null = push is not set up on this server. */
  publicKey: string | null;
  prefs: NotificationPrefs;
  /** Devices of this account that receive push. */
  devices: number;
  /** The server can push to the app (FCM); otherwise the app plans reminders itself. */
  appPush: boolean;
}

export interface WeeklyRecap {
  weekStart: string;
  xp: number;
  quests: number;
  activeDays: number;
  wordsMatured: number;
  reviewMinutes: number;
  bestDay: { day: string; xp: number } | null;
  badges: { badgeId: string; tier: string }[];
  classChallenges: number;
}

const MESSAGES: Record<string, string> = {
  push_disabled: 'Erinnerungen sind auf diesem Server noch nicht eingerichtet.',
};

export class NotificationsApi {
  constructor(private readonly fetchImpl: Fetch = (...args) => fetch(...args)) {}

  config() {
    return this.call<NotificationConfig>('/api/v1/notifications');
  }

  savePrefs(prefs: NotificationPrefs) {
    return this.call<void>('/api/v1/notifications/preferences', {
      method: 'PUT',
      body: JSON.stringify(prefs),
    });
  }

  subscribe(subscription: PushSubscriptionJSON) {
    return this.call<void>('/api/v1/notifications/subscriptions', {
      method: 'POST',
      body: JSON.stringify({ endpoint: subscription.endpoint, keys: subscription.keys }),
    });
  }

  unsubscribe(endpoint: string) {
    return this.call<void>('/api/v1/notifications/subscriptions', {
      method: 'DELETE',
      body: JSON.stringify({ endpoint }),
    });
  }

  /** The app's FCM device token (ADR-0019). */
  registerDevice(token: string, platform: 'ios' | 'android') {
    return this.call<void>('/api/v1/notifications/devices', {
      method: 'POST',
      body: JSON.stringify({ token, platform }),
    });
  }

  unregisterDevice(token: string) {
    return this.call<void>('/api/v1/notifications/devices', {
      method: 'DELETE',
      body: JSON.stringify({ token }),
    });
  }

  latestRecap() {
    return this.call<{ recap: WeeklyRecap | null }>('/api/v1/recaps/latest');
  }

  private call<T>(path: string, init: RequestInit = {}) {
    return apiRequest<T>(this.fetchImpl, path, init, MESSAGES);
  }
}
