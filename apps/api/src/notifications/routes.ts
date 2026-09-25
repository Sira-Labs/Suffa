/**
 * Notifications of the signed-in user (stories 6.3, 6.4), mounted at /api/v1:
 *
 *   GET    /notifications              → { publicKey | null, prefs, devices, appPush } (profile:read)
 *   PUT    /notifications/preferences  { reminderEnabled, reminderTime, … }    (profile:write)
 *   POST   /notifications/subscriptions { endpoint, keys: { p256dh, auth } } (profile:write)
 *   DELETE /notifications/subscriptions { endpoint }                        (profile:write)
 *   POST   /notifications/devices   { token, platform } (the native app, FCM) (profile:write)
 *   DELETE /notifications/devices   { token }                               (profile:write)
 *   GET    /recaps/latest              → { recap | null }                   (profile:read)
 */
import { Hono, type Context } from 'hono';
import { z } from 'zod';
import type { AuthResolver } from '../auth/resolver.js';
import { authorize, type ActorEnv, type AuthorizeLog } from '../authz/middleware.js';
import { FCM_PREFIX } from './fcm.js';
import type { RecapRepository } from './recap.js';
import type { NotificationRepository } from './repository.js';

export interface NotificationRouteDeps {
  repo: NotificationRepository;
  recaps: Pick<RecapRepository, 'latest'>;
  /** VAPID public key for the browser; null when push is not configured. */
  publicKey: string | null;
  /** App push (FCM) is configured on this server. */
  appPush?: boolean;
  auth: AuthResolver;
  log: AuthorizeLog;
}

const Time = z.string().regex(/^([01][0-9]|2[0-3]):[0-5][0-9]$/);
const Prefs = z
  .object({
    reminderEnabled: z.boolean(),
    reminderTime: Time,
    quietStart: Time,
    quietEnd: Time,
    weeklyRecap: z.boolean(),
  })
  .strict();
// Push services are https endpoints; keys are base64url.
const Endpoint = z.string().url().max(1000).startsWith('https://');
const Key = z.string().regex(/^[A-Za-z0-9_-]+=*$/);
const Subscription = z.object({
  endpoint: Endpoint,
  keys: z.object({ p256dh: Key.max(200), auth: Key.max(100) }),
});
const Unsubscribe = z.object({ endpoint: Endpoint });
// FCM registration tokens: URL-safe, a few hundred characters.
const DeviceToken = z.string().regex(/^[A-Za-z0-9_:.-]{20,900}$/);
const Device = z
  .object({ token: DeviceToken, platform: z.enum(['ios', 'android']) })
  .strict();
const RemoveDevice = z.object({ token: DeviceToken }).strict();

export function createNotificationRoutes(deps: NotificationRouteDeps): Hono<ActorEnv> {
  const app = new Hono<ActorEnv>();
  const read = authorize(deps.auth, 'profile:read', deps.log);
  const write = authorize(deps.auth, 'profile:write', deps.log);
  const me = (c: Context<ActorEnv>) => c.get('actor').id;

  app.get('/notifications', read, async (c) => {
    c.header('Cache-Control', 'no-store');
    const { devices, ...prefs } = await deps.repo.prefs(me(c));
    return c.json({
      publicKey: deps.publicKey,
      prefs,
      devices,
      appPush: deps.appPush === true,
    });
  });

  app.put('/notifications/preferences', write, async (c) => {
    const parsed = Prefs.safeParse(await readJson(c));
    if (!parsed.success) return c.json({ error: 'invalid_body' }, 400);
    await deps.repo.savePrefs(me(c), parsed.data);
    return c.body(null, 204);
  });

  app.post('/notifications/subscriptions', write, async (c) => {
    if (!deps.publicKey) return c.json({ error: 'push_disabled' }, 409);
    const parsed = Subscription.safeParse(await readJson(c));
    if (!parsed.success) return c.json({ error: 'invalid_body' }, 400);
    await deps.repo.subscribe(
      me(c),
      {
        endpoint: parsed.data.endpoint,
        p256dh: parsed.data.keys.p256dh,
        auth: parsed.data.keys.auth,
      },
      c.req.header('user-agent')?.slice(0, 300) ?? null
    );
    return c.body(null, 204);
  });

  app.delete('/notifications/subscriptions', write, async (c) => {
    const parsed = Unsubscribe.safeParse(await readJson(c));
    if (!parsed.success) return c.json({ error: 'invalid_body' }, 400);
    await deps.repo.unsubscribe(me(c), parsed.data.endpoint);
    return c.body(null, 204);
  });

  // App devices are stored like web push subscriptions (endpoint "fcm:<token>").
  app.post('/notifications/devices', write, async (c) => {
    if (!deps.appPush) return c.json({ error: 'push_disabled' }, 409);
    const parsed = Device.safeParse(await readJson(c));
    if (!parsed.success) return c.json({ error: 'invalid_body' }, 400);
    await deps.repo.subscribe(
      me(c),
      { endpoint: `${FCM_PREFIX}${parsed.data.token}`, p256dh: '', auth: '' },
      `app:${parsed.data.platform}`
    );
    return c.body(null, 204);
  });

  app.delete('/notifications/devices', write, async (c) => {
    const parsed = RemoveDevice.safeParse(await readJson(c));
    if (!parsed.success) return c.json({ error: 'invalid_body' }, 400);
    await deps.repo.unsubscribe(me(c), `${FCM_PREFIX}${parsed.data.token}`);
    return c.body(null, 204);
  });

  app.get('/recaps/latest', read, async (c) => {
    c.header('Cache-Control', 'no-store');
    return c.json({ recap: await deps.recaps.latest(me(c)) });
  });

  return app;
}

async function readJson(c: Context): Promise<unknown> {
  try {
    return await c.req.json();
  } catch (error) {
    if (error instanceof SyntaxError) return null;
    throw error;
  }
}
