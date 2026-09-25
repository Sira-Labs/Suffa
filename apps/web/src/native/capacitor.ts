/**
 * The Capacitor runtime the app shell injects (ADR-0019). The web build carries no native
 * dependency: plugins are reached through the runtime's registry, so in a browser every
 * helper here answers "not native" and the PWA behaves as before.
 */
export interface PluginListenerHandle {
  remove(): Promise<void>;
}

export interface CapacitorRuntime {
  isNativePlatform(): boolean;
  getPlatform(): string;
  Plugins: Record<string, unknown>;
}

type WithCapacitor = { Capacitor?: CapacitorRuntime };

/** The native runtime, or null in a browser (also for Capacitor's web fallback). */
export function capacitor(scope: object = globalThis): CapacitorRuntime | null {
  const runtime = (scope as WithCapacitor).Capacitor;
  return runtime?.isNativePlatform?.() ? runtime : null;
}

export function isNativeApp(scope: object = globalThis): boolean {
  return capacitor(scope) !== null;
}

/** A registered native plugin by name, or null when the shell does not include it. */
export function plugin<T>(name: string, runtime = capacitor()): T | null {
  return (runtime?.Plugins[name] as T | undefined) ?? null;
}

// The slices of the plugin APIs Suffa uses (@capacitor/app, preferences,
// local-notifications, push-notifications; capacitor-secure-storage-plugin).

export interface AppPlugin {
  addListener(
    event: 'appUrlOpen',
    listener: (event: { url: string }) => void
  ): Promise<PluginListenerHandle>;
}

export interface KeyValuePlugin {
  get(options: { key: string }): Promise<{ value: string | null }>;
  set(options: { key: string; value: string }): Promise<void>;
  remove(options: { key: string }): Promise<void>;
}

export interface LocalNotificationsPlugin {
  requestPermissions(): Promise<{ display: string }>;
  schedule(options: {
    notifications: {
      id: number;
      title: string;
      body: string;
      schedule: { at: Date; allowWhileIdle?: boolean };
    }[];
  }): Promise<unknown>;
  cancel(options: { notifications: { id: number }[] }): Promise<void>;
}

export interface PushNotificationsPlugin {
  requestPermissions(): Promise<{ receive: string }>;
  register(): Promise<void>;
  unregister(): Promise<void>;
  addListener(
    event: 'registration',
    listener: (token: { value: string }) => void
  ): Promise<PluginListenerHandle>;
  addListener(
    event: 'registrationError',
    listener: (error: { error: string }) => void
  ): Promise<PluginListenerHandle>;
}
