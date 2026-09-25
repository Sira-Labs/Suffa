import { describe, expect, it, vi } from 'vitest';
import { base64UrlToBytes, disablePush, enablePush, pushSupported } from './push';
import { NotificationsApi } from './notificationsApi';

describe('push helpers', () => {
  it('decodes base64url VAPID keys', () => {
    expect([...base64UrlToBytes('AQID_-8')]).toEqual([1, 2, 3, 255, 239]);
  });

  it('explains that this device cannot receive push (jsdom has no PushManager)', async () => {
    expect(pushSupported()).toBe(false);
    const api = new NotificationsApi(vi.fn() as unknown as typeof fetch);
    expect(await enablePush(api, 'BKey')).toMatchObject({
      ok: false,
      reason: 'unsupported',
    });
    await expect(disablePush(api)).resolves.toBeUndefined();
  });

  it('sends the subscription and preferences to the server', async () => {
    const calls: { method: string; path: string; body: unknown }[] = [];
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({
        method: init?.method ?? 'GET',
        path: String(input),
        body: init?.body ? JSON.parse(String(init.body)) : null,
      });
      return new Response(null, { status: 204 });
    }) as unknown as typeof fetch;
    const api = new NotificationsApi(fetchImpl);
    await api.subscribe({
      endpoint: 'https://push.example/1',
      keys: { p256dh: 'k', auth: 'a' },
    });
    await api.unsubscribe('https://push.example/1');
    expect(calls).toEqual([
      {
        method: 'POST',
        path: '/api/v1/notifications/subscriptions',
        body: { endpoint: 'https://push.example/1', keys: { p256dh: 'k', auth: 'a' } },
      },
      {
        method: 'DELETE',
        path: '/api/v1/notifications/subscriptions',
        body: { endpoint: 'https://push.example/1' },
      },
    ]);
  });
});
