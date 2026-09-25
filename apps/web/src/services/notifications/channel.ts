/**
 * How this device receives reminders (ADR-0019): web push in a browser; in the app FCM when
 * the server can send to it, else reminders the device plans itself. The settings card talks
 * to this interface only.
 */
import { enableAppPush, disableAppPush } from '@/native/appPush';
import type { NativeBridge } from '@/native/install';
import type {
  NotificationConfig,
  NotificationPrefs,
  NotificationsApi,
} from './notificationsApi';
import { disablePush, enablePush, pushSupported, type PushOutcome } from './push';

export interface ReminderChannel {
  /** Whether reminders can be set up at all with this server and device. */
  available(config: NotificationConfig): boolean;
  /** Why this device cannot receive them (shown above the settings), or null. */
  hint(): string | null;
  /** Permission and registration when reminders are switched on. */
  enable(api: NotificationsApi, config: NotificationConfig): Promise<PushOutcome>;
  disable(api: NotificationsApi, config: NotificationConfig): Promise<void>;
  /** After the settings were saved. */
  saved(prefs: NotificationPrefs, config: NotificationConfig): Promise<void>;
  /** The line next to the save button. */
  status(config: NotificationConfig): string;
}

function devicesLine(config: NotificationConfig): string {
  if (config.devices === 0) return 'Noch kein Gerät angemeldet';
  return `${config.devices} ${config.devices === 1 ? 'Gerät bekommt' : 'Geräte bekommen'} Mitteilungen`;
}

export const webPushChannel: ReminderChannel = {
  available: (config) => config.publicKey !== null,
  hint: () =>
    pushSupported()
      ? null
      : 'Dieses Gerät kann keine Mitteilungen empfangen. Auf iPhone/iPad: Suffa zum Home-Bildschirm hinzufügen und von dort öffnen.',
  enable: (api, config) => enablePush(api, config.publicKey ?? ''),
  disable: (api) => disablePush(api),
  saved: async () => undefined,
  status: devicesLine,
};

export function appChannel(bridge: NativeBridge): ReminderChannel {
  const serverPush = (config: NotificationConfig) =>
    config.appPush && bridge.push !== null;
  return {
    available: (config) => serverPush(config) || bridge.reminders !== null,
    hint: () => null,
    async enable(api, config) {
      if (serverPush(config)) return enableAppPush(bridge.push!, api, bridge.platform);
      if (await bridge.reminders!.permit()) return { ok: true };
      return {
        ok: false,
        reason: 'denied',
        message:
          'Mitteilungen sind blockiert. Erlaube sie in den Einstellungen des Geräts.',
      };
    },
    async disable(api, config) {
      if (serverPush(config)) await disableAppPush(bridge.push!, api);
    },
    async saved(prefs, config) {
      // Without server push the device plans the daily reminder itself; with it, any plan
      // left from before is cleared so no reminder comes twice.
      await bridge.reminders?.plan(
        serverPush(config) ? { ...prefs, reminderEnabled: false } : prefs
      );
    },
    status: (config) =>
      serverPush(config)
        ? devicesLine(config)
        : 'Dieses Gerät plant die Erinnerung selbst',
  };
}
