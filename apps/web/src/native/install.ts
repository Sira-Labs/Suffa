/**
 * Starts the app shell's side of Suffa (ADR-0019) before the first render: loads the session
 * token, sends server paths to the Suffa server with it, plans local reminders and listens for
 * app links. In a browser nothing happens and the PWA runs as before.
 */
import { logger } from '@/services/logger';
import {
  capacitor,
  plugin,
  type AppPlugin,
  type KeyValuePlugin,
  type PushNotificationsPlugin,
} from './capacitor';
import { openDeepLink, type DeepLinkDeps } from './deepLinks';
import { createNativeFetch, serverUrl } from './nativeFetch';
import { createLocalReminders, type LocalReminders } from './reminders';
import { createTokenStore, type TokenStore } from './tokenStore';

const log = logger.child('native');

export interface NativeBridge {
  platform: 'ios' | 'android';
  apiOrigin: string;
  appOrigin: string;
  tokens: TokenStore;
  /** Device-scheduled reminders; null when the shell lacks the plugin. */
  reminders: LocalReminders | null;
  /** FCM; null when the shell lacks the plugin. */
  push: PushNotificationsPlugin | null;
}

let active: NativeBridge | null = null;

/** The running bridge, or null in a browser. */
export function nativeBridge(): NativeBridge | null {
  return active;
}

/**
 * An address a media element can load: in the app, server paths (`/media/…`) point at the
 * Suffa server; in a browser, and for any other URL, the value is returned as it is.
 */
export function playableUrl(value: string): string {
  if (!active) return value;
  return serverUrl(value, active)?.href ?? value;
}

export async function installNativeBridge(
  scope: typeof globalThis = globalThis,
  apiOrigin: string | undefined = import.meta.env.VITE_SUFFA_API_ORIGIN
): Promise<NativeBridge | null> {
  const runtime = capacitor(scope);
  if (!runtime) return null;
  if (!apiOrigin) {
    log.error('VITE_SUFFA_API_ORIGIN is not set for the app build; staying offline');
    return null;
  }
  const platform = runtime.getPlatform() === 'ios' ? 'ios' : 'android';
  const tokens = createTokenStore(
    plugin<KeyValuePlugin>('SecureStoragePlugin', runtime) ??
      plugin<KeyValuePlugin>('Preferences', runtime)
  );
  await tokens.load();
  const origin = new URL(apiOrigin).origin;
  const appOrigin = scope.location.origin;
  scope.fetch = createNativeFetch(scope.fetch.bind(scope), {
    apiOrigin: origin,
    tokens,
    appOrigin,
  });
  active = {
    platform,
    apiOrigin: origin,
    appOrigin,
    tokens,
    reminders: createLocalReminders(plugin('LocalNotifications', runtime)),
    push: plugin<PushNotificationsPlugin>('PushNotifications', runtime),
  };
  void active.reminders?.replan().catch((error: unknown) => {
    log.warn('reminders not planned', { error: String(error) });
  });
  log.info('native bridge ready', { platform, apiOrigin: origin });
  return active;
}

/** Routes links that opened the app (sign-in, invitations) into it. */
export async function listenForAppLinks(deps: DeepLinkDeps): Promise<void> {
  const app = plugin<AppPlugin>('App');
  if (!app) return;
  await app.addListener('appUrlOpen', ({ url }) => {
    void openDeepLink(url, deps);
  });
}

/** Test seam: forget the installed bridge. */
export function resetNativeBridge(): void {
  active = null;
}
