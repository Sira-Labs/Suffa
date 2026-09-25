/**
 * This device's push subscription (story 6.3). Push needs a service worker and permission;
 * on iPhone and iPad only when Suffa is installed on the home screen.
 */
import type { NotificationsApi } from './notificationsApi';

export type PushOutcome =
  | { ok: true }
  | { ok: false; reason: 'unsupported' | 'denied' | 'server'; message: string };

export function pushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

/** VAPID keys are base64url; the Push API wants the raw bytes. */
export function base64UrlToBytes(value: string): Uint8Array {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

/** Asks for permission, subscribes this device and registers it with the server. */
export async function enablePush(
  api: NotificationsApi,
  publicKey: string
): Promise<PushOutcome> {
  if (!pushSupported()) {
    return {
      ok: false,
      reason: 'unsupported',
      message:
        'Dieses Gerät kann keine Erinnerungen empfangen. Auf iPhone/iPad: Suffa zum Home-Bildschirm hinzufügen und von dort öffnen.',
    };
  }
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    return {
      ok: false,
      reason: 'denied',
      message: 'Mitteilungen sind blockiert. Erlaube sie in den Browser-Einstellungen.',
    };
  }
  const registration = await navigator.serviceWorker.ready;
  const subscription =
    (await registration.pushManager.getSubscription()) ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: base64UrlToBytes(publicKey) as BufferSource,
    }));
  const result = await api.subscribe(subscription.toJSON());
  return result.ok
    ? { ok: true }
    : { ok: false, reason: 'server', message: result.message };
}

/** Removes this device's subscription (on the server and in the browser). */
export async function disablePush(api: NotificationsApi): Promise<void> {
  if (!pushSupported()) return;
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return;
  await api.unsubscribe(subscription.endpoint);
  await subscription.unsubscribe();
}
