import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { disableAppPush, enableAppPush } from '@/native/appPush';
import type {
  CapacitorRuntime,
  KeyValuePlugin,
  LocalNotificationsPlugin,
  PushNotificationsPlugin,
} from '@/native/capacitor';
import { capacitor, isNativeApp } from '@/native/capacitor';
import { inAppPath, openDeepLink } from '@/native/deepLinks';
import {
  installNativeBridge,
  nativeBridge,
  playableUrl,
  resetNativeBridge,
} from '@/native/install';
import { createNativeFetch, serverUrl } from '@/native/nativeFetch';
import { createLocalReminders, inQuietHours, reminderTimes } from '@/native/reminders';
import { createTokenStore } from '@/native/tokenStore';
import { appChannel } from '@/services/notifications/channel';
import { NotificationsApi } from '@/services/notifications/notificationsApi';

const API = 'https://suffa.example.org';
const APP = 'capacitor://localhost';

function memoryStorage(initial: Record<string, string> = {}): KeyValuePlugin & {
  data: Record<string, string>;
} {
  const data = { ...initial };
  return {
    data,
    get: async ({ key }) => ({ value: data[key] ?? null }),
    set: async ({ key, value }) => {
      data[key] = value;
    },
    remove: async ({ key }) => {
      delete data[key];
    },
  };
}

interface Seen {
  url: string;
  init: RequestInit;
}

function fakeBase(respond: (url: string) => Response = () => Response.json({})) {
  const seen: Seen[] = [];
  const base = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    seen.push({ url: String(input), init });
    return respond(String(input));
  }) as unknown as typeof fetch;
  return { base, seen };
}

describe('Capacitor runtime detection', () => {
  it('is native only when the runtime says so', () => {
    expect(isNativeApp({})).toBe(false);
    expect(capacitor({ Capacitor: { isNativePlatform: () => false } })).toBeNull();
    expect(
      isNativeApp({ Capacitor: { isNativePlatform: () => true, Plugins: {} } })
    ).toBe(true);
  });
});

describe('native fetch', () => {
  it('maps only app-relative server paths to the server', () => {
    const opts = { apiOrigin: API, appOrigin: APP };
    expect(serverUrl('/api/v1/me?x=1', opts)?.href).toBe(`${API}/api/v1/me?x=1`);
    expect(serverUrl(`${APP}/media/a.m4a?sig=1`, opts)?.href).toBe(
      `${API}/media/a.m4a?sig=1`
    );
    expect(serverUrl('/assets/app.js', opts)).toBeNull();
    expect(serverUrl('https://other.example/api/v1/me', opts)).toBeNull();
    expect(serverUrl('blob:capacitor://localhost/123', opts)).toBeNull();
  });

  it('sends the bearer token to the API, never cookies, and stores an issued token', async () => {
    const storage = memoryStorage({ 'suffa.session': 'old.sig' });
    const tokens = createTokenStore(storage);
    await tokens.load();
    const { base, seen } = fakeBase(
      () => new Response('{}', { headers: { 'set-auth-token': 'new.sig' } })
    );
    const f = createNativeFetch(base, { apiOrigin: API, appOrigin: APP, tokens });
    await f('/api/v1/sync/push', { method: 'POST', body: '{"a":1}' });
    expect(seen[0]!.url).toBe(`${API}/api/v1/sync/push`);
    expect(seen[0]!.init.credentials).toBe('omit');
    expect(new Headers(seen[0]!.init.headers).get('authorization')).toBe(
      'Bearer old.sig'
    );
    expect(seen[0]!.init.body).toBe('{"a":1}');
    expect(tokens.current()).toBe('new.sig');
    expect(storage.data['suffa.session']).toBe('new.sig');
  });

  it('does not put the token on media or foreign requests', async () => {
    const tokens = createTokenStore(memoryStorage({ 'suffa.session': 't.sig' }));
    await tokens.load();
    const { base, seen } = fakeBase();
    const f = createNativeFetch(base, { apiOrigin: API, appOrigin: APP, tokens });
    await f('/media/x.m4a?sig=1');
    await f('https://youtube.example/api/x');
    expect(new Headers(seen[0]!.init.headers).has('authorization')).toBe(false);
    expect(seen[1]!.url).toBe('https://youtube.example/api/x');
  });

  it('forgets the token on 401 and after signing out', async () => {
    const storage = memoryStorage({ 'suffa.session': 't.sig' });
    const tokens = createTokenStore(storage);
    await tokens.load();
    const f401 = createNativeFetch(
      fakeBase(() => new Response(null, { status: 401 })).base,
      {
        apiOrigin: API,
        appOrigin: APP,
        tokens,
      }
    );
    await f401('/api/v1/me');
    expect(tokens.current()).toBeNull();
    expect(storage.data).toEqual({});

    await tokens.save('u.sig');
    const fOk = createNativeFetch(fakeBase().base, {
      apiOrigin: API,
      appOrigin: APP,
      tokens,
    });
    await fOk('/api/v1/auth/sign-out', { method: 'POST' });
    expect(tokens.current()).toBeNull();
  });

  it('copies method, headers and body from a Request', async () => {
    const tokens = createTokenStore(null);
    const { base, seen } = fakeBase();
    const f = createNativeFetch(base, { apiOrigin: API, appOrigin: APP, tokens });
    await f(
      new Request(`${APP}/api/v1/x`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: '{"b":2}',
      })
    );
    expect(seen[0]!.init.method).toBe('PUT');
    expect(new Headers(seen[0]!.init.headers).get('content-type')).toBe(
      'application/json'
    );
    expect(new TextDecoder().decode(seen[0]!.init.body as ArrayBuffer)).toBe('{"b":2}');
  });
});

describe('token store', () => {
  it('treats a rejected read (secure storage without the key) as no token', async () => {
    const store = createTokenStore({
      ...memoryStorage(),
      get: async () => {
        throw new Error('Item with given key does not exist');
      },
    });
    expect(await store.load()).toBeNull();
  });
});

describe('app links', () => {
  it('verifies the sign-in link without its callback and opens the page it named', async () => {
    const { base, seen } = fakeBase();
    const navigate = vi.fn();
    const signedIn = vi.fn(async () => undefined);
    const outcome = await openDeepLink(
      `${API}/api/v1/auth/magic-link/verify?token=abc&callbackURL=%2Fjoin%2FK7X`,
      { fetch: base, navigate, signedIn }
    );
    expect(outcome).toBe('signed-in');
    expect(seen[0]!.url).toBe('/api/v1/auth/magic-link/verify?token=abc');
    expect(signedIn).toHaveBeenCalledOnce();
    expect(navigate).toHaveBeenCalledWith('/join/K7X');
  });

  it('never follows a callback to another site', async () => {
    const navigate = vi.fn();
    await openDeepLink(
      `${API}/api/v1/auth/magic-link/verify?token=abc&callbackURL=https%3A%2F%2Fevil.example`,
      { fetch: fakeBase().base, navigate, signedIn: async () => undefined }
    );
    expect(navigate).toHaveBeenCalledWith('/settings?angemeldet=1');
    expect(inAppPath('//evil.example')).toBeNull();
  });

  it('explains a used link on the settings page', async () => {
    const navigate = vi.fn();
    const outcome = await openDeepLink(`${API}/api/v1/auth/magic-link/verify?token=x`, {
      fetch: fakeBase(() => Response.json({ code: 'INVALID_TOKEN' }, { status: 400 }))
        .base,
      navigate,
      signedIn: async () => undefined,
    });
    expect(outcome).toBe('sign-in-failed');
    expect(navigate).toHaveBeenCalledWith('/settings?error=INVALID_TOKEN');
  });

  it('opens invitations and ignores other links', async () => {
    const navigate = vi.fn();
    const deps = { fetch: fakeBase().base, navigate, signedIn: async () => undefined };
    expect(await openDeepLink(`${API}/join/K7X`, deps)).toBe('navigated');
    expect(navigate).toHaveBeenCalledWith('/join/K7X');
    expect(await openDeepLink(`${API}/admin`, deps)).toBe('ignored');
    expect(await openDeepLink('not a url', deps)).toBe('ignored');
  });
});

describe('device reminders', () => {
  const plan = {
    reminderEnabled: true,
    reminderTime: '18:00',
    quietStart: '22:00',
    quietEnd: '07:00',
  };

  it('knows quiet hours across midnight', () => {
    expect(inQuietHours('23:00', '22:00', '07:00')).toBe(true);
    expect(inQuietHours('06:59', '22:00', '07:00')).toBe(true);
    expect(inQuietHours('07:00', '22:00', '07:00')).toBe(false);
    expect(inQuietHours('13:00', '12:00', '14:00')).toBe(true);
    expect(inQuietHours('13:00', '00:00', '00:00')).toBe(false);
  });

  it('plans a week ahead, skipping today once learned or past', () => {
    const morning = new Date(2026, 8, 25, 9, 0);
    const times = reminderTimes(plan, morning, false);
    expect(times).toHaveLength(7);
    expect(times[0]).toEqual(new Date(2026, 8, 25, 18, 0));
    expect(reminderTimes(plan, morning, true)[0]).toEqual(new Date(2026, 8, 26, 18, 0));
    expect(reminderTimes(plan, new Date(2026, 8, 25, 19, 0), false)[0]).toEqual(
      new Date(2026, 8, 26, 18, 0)
    );
    expect(reminderTimes({ ...plan, reminderTime: '23:00' }, morning, false)).toEqual([]);
    expect(reminderTimes({ ...plan, reminderEnabled: false }, morning, false)).toEqual(
      []
    );
  });

  it('replaces the planned notifications and re-plans from the saved plan', async () => {
    const calls: string[] = [];
    const notifications: LocalNotificationsPlugin = {
      requestPermissions: async () => ({ display: 'granted' }),
      cancel: async ({ notifications: n }) => {
        calls.push(`cancel ${n.length}`);
      },
      schedule: async ({ notifications: n }) => {
        calls.push(`schedule ${n.map((x) => x.id).join(',')}`);
      },
    };
    const reminders = createLocalReminders(notifications)!;
    const now = new Date(2026, 8, 25, 9, 0);
    expect(await reminders.plan(plan, { now })).toBe(7);
    expect(await reminders.replan({ now, doneToday: true })).toBe(7);
    expect(await reminders.plan({ ...plan, reminderEnabled: false }, { now })).toBe(0);
    expect(calls).toEqual([
      'cancel 7',
      'schedule 7001,7002,7003,7004,7005,7006,7007',
      'cancel 7',
      'schedule 7001,7002,7003,7004,7005,7006,7007',
      'cancel 7',
    ]);
    expect(createLocalReminders(null)).toBeNull();
  });
});

function fakePush(outcome: 'token' | 'error', receive = 'granted') {
  const listeners: Record<string, (v: never) => void> = {};
  const push = {
    requestPermissions: vi.fn(async () => ({ receive })),
    register: vi.fn(async () => {
      queueMicrotask(() =>
        outcome === 'token'
          ? listeners.registration!({ value: 'fcm-token-1234567890abcdef' } as never)
          : listeners.registrationError!({ error: 'no play services' } as never)
      );
    }),
    unregister: vi.fn(async () => undefined),
    addListener: vi.fn(async (event: string, listener: (v: never) => void) => {
      listeners[event] = listener;
      return { remove: async () => undefined };
    }),
  };
  return push as unknown as PushNotificationsPlugin & typeof push;
}

describe('app push (FCM)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('registers the device token with the server and removes it again', async () => {
    const bodies: unknown[] = [];
    const api = new NotificationsApi(async (_input, init) => {
      bodies.push({ method: init?.method, body: JSON.parse(String(init?.body)) });
      return new Response(null, { status: 204 });
    });
    const push = fakePush('token');
    expect(await enableAppPush(push, api, 'ios')).toEqual({ ok: true });
    await disableAppPush(push, api);
    expect(bodies).toEqual([
      { method: 'POST', body: { token: 'fcm-token-1234567890abcdef', platform: 'ios' } },
      { method: 'DELETE', body: { token: 'fcm-token-1234567890abcdef' } },
    ]);
    expect(push.unregister).toHaveBeenCalled();
  });

  it('reports a declined permission and a failed registration', async () => {
    const api = new NotificationsApi(async () => new Response(null, { status: 204 }));
    expect(
      await enableAppPush(fakePush('token', 'denied'), api, 'android')
    ).toMatchObject({
      ok: false,
      reason: 'denied',
    });
    expect(await enableAppPush(fakePush('error'), api, 'android')).toMatchObject({
      ok: false,
      reason: 'unsupported',
    });
  });
});

describe('reminder channel in the app', () => {
  const config = {
    publicKey: null,
    prefs: {
      reminderEnabled: true,
      reminderTime: '18:00',
      quietStart: '22:00',
      quietEnd: '07:00',
      weeklyRecap: false,
    },
    devices: 0,
    appPush: false,
  };

  it('plans on the device without server push and clears that plan with it', async () => {
    const plan = vi.fn(async () => 0);
    const bridge = {
      platform: 'android' as const,
      apiOrigin: API,
      appOrigin: APP,
      tokens: createTokenStore(null),
      reminders: { permit: async () => true, plan, replan: async () => 0 },
      push: fakePush('token'),
    };
    const channel = appChannel(bridge);
    expect(channel.available(config)).toBe(true);
    expect(channel.status(config)).toMatch(/plant die Erinnerung selbst/);
    await channel.saved(config.prefs, config);
    expect(plan).toHaveBeenLastCalledWith(config.prefs);
    await channel.saved(config.prefs, { ...config, appPush: true });
    expect(plan).toHaveBeenLastCalledWith({ ...config.prefs, reminderEnabled: false });
    expect(appChannel({ ...bridge, reminders: null, push: null }).available(config)).toBe(
      false
    );
  });
});

describe('installing the bridge', () => {
  beforeEach(() => resetNativeBridge());
  afterEach(() => resetNativeBridge());

  it('does nothing in a browser', async () => {
    expect(await installNativeBridge({} as typeof globalThis, API)).toBeNull();
    expect(nativeBridge()).toBeNull();
    expect(playableUrl('/media/a.m4a')).toBe('/media/a.m4a');
  });

  it('stays offline without a configured server', async () => {
    const scope = {
      Capacitor: { isNativePlatform: () => true, getPlatform: () => 'ios', Plugins: {} },
    } as unknown as typeof globalThis;
    expect(await installNativeBridge(scope, undefined)).toBeNull();
  });

  it('loads the token, wraps fetch and resolves media for players', async () => {
    const { base, seen } = fakeBase();
    const runtime: CapacitorRuntime = {
      isNativePlatform: () => true,
      getPlatform: () => 'ios',
      Plugins: { Preferences: memoryStorage({ 'suffa.session': 's.sig' }) },
    };
    const scope = {
      Capacitor: runtime,
      fetch: base,
      location: { origin: APP },
    } as unknown as typeof globalThis;
    const bridge = await installNativeBridge(scope, `${API}/`);
    expect(bridge).toMatchObject({ platform: 'ios', apiOrigin: API, reminders: null });
    await scope.fetch('/api/v1/me');
    expect(seen[0]!.url).toBe(`${API}/api/v1/me`);
    expect(new Headers(seen[0]!.init.headers).get('authorization')).toBe('Bearer s.sig');
    expect(playableUrl('/media/a.m4a?sig=1')).toBe(`${API}/media/a.m4a?sig=1`);
    expect(playableUrl('blob:capacitor://localhost/1')).toBe(
      'blob:capacitor://localhost/1'
    );
  });
});
