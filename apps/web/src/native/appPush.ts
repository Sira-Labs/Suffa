/**
 * Push for the app (ADR-0019): the device registers with FCM (APNs on iOS through FCM) and
 * hands its token to the server, which sends reminders, recaps and class news to it the same
 * way it does to web push subscriptions.
 */
import { logger } from '@/services/logger';
import type { NotificationsApi } from '@/services/notifications/notificationsApi';
import type { PushOutcome } from '@/services/notifications/push';
import type { PushNotificationsPlugin } from './capacitor';

const log = logger.child('native:push');
const TOKEN_KEY = 'suffa.fcmToken';
const REGISTER_TIMEOUT_MS = 15_000;

/** Waits for the device token after `register()`. */
function deviceToken(push: PushNotificationsPlugin): Promise<string> {
  return new Promise((resolve, reject) => {
    const handles: Promise<{ remove(): Promise<void> }>[] = [];
    const done = () => {
      clearTimeout(timer);
      for (const h of handles) void h.then((handle) => handle.remove());
    };
    const timer = setTimeout(() => {
      done();
      reject(new Error('no device token from FCM'));
    }, REGISTER_TIMEOUT_MS);
    handles.push(
      push.addListener('registration', ({ value }) => {
        done();
        resolve(value);
      }),
      push.addListener('registrationError', ({ error }) => {
        done();
        reject(new Error(error));
      })
    );
    void push.register().catch((error: unknown) => {
      done();
      reject(error instanceof Error ? error : new Error(String(error)));
    });
  });
}

export async function enableAppPush(
  push: PushNotificationsPlugin,
  api: NotificationsApi,
  platform: 'ios' | 'android'
): Promise<PushOutcome> {
  const { receive } = await push.requestPermissions();
  if (receive !== 'granted') {
    return {
      ok: false,
      reason: 'denied',
      message:
        'Mitteilungen sind blockiert. Erlaube sie in den Einstellungen des Geräts.',
    };
  }
  let token: string;
  try {
    token = await deviceToken(push);
  } catch (error) {
    log.warn('push registration failed', { error: String(error) });
    return {
      ok: false,
      reason: 'unsupported',
      message: 'Dieses Gerät konnte sich nicht für Mitteilungen anmelden.',
    };
  }
  const result = await api.registerDevice(token, platform);
  if (!result.ok) return { ok: false, reason: 'server', message: result.message };
  localStorage.setItem(TOKEN_KEY, token);
  return { ok: true };
}

export async function disableAppPush(
  push: PushNotificationsPlugin,
  api: NotificationsApi
): Promise<void> {
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) await api.unregisterDevice(token);
  localStorage.removeItem(TOKEN_KEY);
  await push.unregister();
}
