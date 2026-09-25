/**
 * The native app's server side (ADR-0019, Sprint 13): CORS only for the app's web view origins
 * (no cookies), Universal Links / App Links files, FCM push with a service account, and the
 * routing between web push and app push.
 */
import { generateKeyPairSync, createVerify } from 'node:crypto';
import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';
import { createAppLinkRoutes } from '../src/apps/links.js';
import { parseAndroidAppLinks, parseServiceAccount } from '../src/config.js';
import { appCors } from '../src/http/appCors.js';
import { sameOriginOnly } from '../src/http/sameOrigin.js';
import {
  FcmNotifier,
  RoutingNotifier,
  serviceAccountJwt,
} from '../src/notifications/fcm.js';
import type { Notifier } from '../src/notifications/notifier.js';

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const account = {
  projectId: 'suffa-app',
  clientEmail: 'push@suffa-app.iam.gserviceaccount.com',
  privateKey: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
};

describe('appCors', () => {
  const app = new Hono();
  app.use('/api/*', appCors(['capacitor://localhost', 'https://localhost']));
  app.use(
    '/api/*',
    sameOriginOnly([
      'https://suffa.example',
      'capacitor://localhost',
      'https://localhost',
    ])
  );
  app.post('/api/v1/thing', (c) => {
    c.header('Access-Control-Expose-Headers', 'x-other');
    return c.json({ ok: true });
  });

  it('answers the preflight of the app origins only', async () => {
    const pre = await app.request('/api/v1/thing', {
      method: 'OPTIONS',
      headers: {
        origin: 'capacitor://localhost',
        'access-control-request-method': 'POST',
      },
    });
    expect(pre.status).toBe(204);
    expect(pre.headers.get('access-control-allow-origin')).toBe('capacitor://localhost');
    expect(pre.headers.get('access-control-allow-headers')).toContain('authorization');
    expect(pre.headers.get('access-control-allow-credentials')).toBeNull();
    const foreign = await app.request('/api/v1/thing', {
      method: 'OPTIONS',
      headers: { origin: 'https://evil.example' },
    });
    expect(foreign.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('lets the app call the API and read the new token, and still refuses other sites', async () => {
    const ok = await app.request('/api/v1/thing', {
      method: 'POST',
      headers: { origin: 'https://localhost', 'sec-fetch-site': 'cross-site' },
    });
    expect(ok.status).toBe(200);
    expect(ok.headers.get('access-control-allow-origin')).toBe('https://localhost');
    expect(ok.headers.get('access-control-expose-headers')).toBe(
      'x-other, set-auth-token'
    );
    const evil = await app.request('/api/v1/thing', {
      method: 'POST',
      headers: { origin: 'https://evil.example', 'sec-fetch-site': 'cross-site' },
    });
    expect(evil.status).toBe(403);
    expect(evil.headers.get('access-control-allow-origin')).toBeNull();
  });
});

describe('app links', () => {
  it('serves the association files when configured, 404 otherwise', async () => {
    const app = new Hono().route(
      '/api/v1',
      createAppLinkRoutes({
        iosAppIds: ['ABCDE12345.org.siralabs.suffa'],
        android: { packageName: 'org.siralabs.suffa', fingerprints: ['AB:CD'] },
      })
    );
    const apple = (await (
      await app.request('/api/v1/app-links/apple-app-site-association')
    ).json()) as {
      applinks: { details: { appIDs: string[]; components: { '/': string }[] }[] };
    };
    expect(apple.applinks.details[0]!.appIDs).toEqual(['ABCDE12345.org.siralabs.suffa']);
    expect(apple.applinks.details[0]!.components.map((c) => c['/'])).toEqual([
      '/api/v1/auth/magic-link/verify',
      '/join/*',
    ]);
    const android = (await (
      await app.request('/api/v1/app-links/assetlinks.json')
    ).json()) as {
      target: { package_name: string }[];
    }[];
    expect(android[0]!.target).toMatchObject({ package_name: 'org.siralabs.suffa' });
    const off = new Hono().route(
      '/api/v1',
      createAppLinkRoutes({ iosAppIds: [], android: undefined })
    );
    expect((await off.request('/api/v1/app-links/assetlinks.json')).status).toBe(404);
    expect(
      (await off.request('/api/v1/app-links/apple-app-site-association')).status
    ).toBe(404);
  });

  it('parses the Android and Firebase settings', () => {
    const fp = Array.from({ length: 32 }, () => 'ab').join(':');
    expect(parseAndroidAppLinks(`org.siralabs.suffa:${fp}`).value).toEqual({
      packageName: 'org.siralabs.suffa',
      fingerprints: [fp.toUpperCase()],
    });
    expect(parseAndroidAppLinks('nonsense').issues).toHaveLength(1);
    expect(parseAndroidAppLinks(undefined)).toEqual({ value: undefined, issues: [] });
    const json = Buffer.from(
      JSON.stringify({
        project_id: account.projectId,
        client_email: account.clientEmail,
        private_key: account.privateKey,
      })
    ).toString('base64');
    expect(parseServiceAccount(json).value).toEqual(account);
    expect(parseServiceAccount(Buffer.from('{}').toString('base64')).issues).toHaveLength(
      1
    );
    expect(
      parseServiceAccount(Buffer.from('not json').toString('base64')).issues
    ).toHaveLength(1);
  });
});

describe('FCM', () => {
  it('signs the service account grant with RS256', () => {
    const jwt = serviceAccountJwt(account, 1_800_000_000);
    const [header, claims, signature] = jwt.split('.');
    const verifier = createVerify('RSA-SHA256');
    verifier.update(`${header}.${claims}`);
    expect(verifier.verify(publicKey, Buffer.from(signature!, 'base64url'))).toBe(true);
    expect(JSON.parse(Buffer.from(claims!, 'base64url').toString())).toMatchObject({
      iss: account.clientEmail,
      scope: 'https://www.googleapis.com/auth/firebase.messaging',
      exp: 1_800_003_600,
    });
  });

  it('sends with a cached token and forgets unregistered devices', async () => {
    const calls: string[] = [];
    let status = 200;
    const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      calls.push(url);
      if (url.includes('oauth2'))
        return Response.json({ access_token: 'at-1', expires_in: 3600 });
      expect((init?.headers as Record<string, string>).authorization).toBe('Bearer at-1');
      const body = JSON.parse(String(init?.body)) as {
        message: { token: string; data: { url: string } };
      };
      expect(body.message).toMatchObject({
        token: 'device-token-123',
        data: { url: '/' },
      });
      if (status === 200) return Response.json({ name: 'projects/x/messages/1' });
      return Response.json(
        {
          error: { details: [{ errorCode: status === 400 ? 'UNREGISTERED' : 'OTHER' }] },
        },
        { status }
      );
    }) as unknown as typeof fetch;
    const fcm = new FcmNotifier(account, fetchImpl, () => 1_000_000);
    const target = { endpoint: 'fcm:device-token-123', p256dh: '', auth: '' };
    const message = {
      title: 'Heute',
      body: 'Deine Karten warten',
      url: '/',
      tag: 'daily-reminder',
    };
    expect(await fcm.send(target, message)).toBe('sent');
    expect(await fcm.send(target, message)).toBe('sent');
    expect(calls.filter((u) => u.includes('oauth2'))).toHaveLength(1);
    status = 400;
    expect(await fcm.send(target, message)).toBe('gone');
    status = 500;
    expect(await fcm.send(target, message)).toBe('failed');
  });

  it('routes app devices to FCM and browsers to web push', async () => {
    const web: Notifier = { enabled: true, send: vi.fn(async () => 'sent' as const) };
    const app: Notifier = { enabled: false, send: vi.fn(async () => 'sent' as const) };
    const routing = new RoutingNotifier(web, app);
    expect(routing.enabled).toBe(true);
    const message = { title: 't', body: 'b', url: '/', tag: 'x' };
    expect(
      await routing.send(
        { endpoint: 'https://push.example/1', p256dh: 'k', auth: 'a' },
        message
      )
    ).toBe('sent');
    // FCM is not configured: an app device is not reached (and not deleted).
    expect(
      await routing.send({ endpoint: 'fcm:abc', p256dh: '', auth: '' }, message)
    ).toBe('failed');
    expect(app.send).not.toHaveBeenCalled();
  });
});
