/**
 * Push to the native apps through Firebase Cloud Messaging, HTTP v1 (ADR-0019). An app
 * device is stored like a web push subscription with the endpoint `fcm:<token>`, so reminders,
 * recaps and the clean-up of dead devices work for both. The OAuth token comes from the
 * service account (a signed JWT exchanged at Google), cached until shortly before it expires.
 */
import { createSign } from 'node:crypto';
import type { Notifier, PushMessage, PushTarget, SendResult } from './notifier.js';

export const FCM_PREFIX = 'fcm:';
const SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';

export interface ServiceAccount {
  projectId: string;
  clientEmail: string;
  privateKey: string;
}

const base64url = (value: string | Buffer) =>
  Buffer.from(value)
    .toString('base64')
    .replace(/=+$/, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

/** The JWT grant for the service account (RS256). */
export function serviceAccountJwt(account: ServiceAccount, nowSec: number): string {
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = base64url(
    JSON.stringify({
      iss: account.clientEmail,
      scope: SCOPE,
      aud: TOKEN_URL,
      iat: nowSec,
      exp: nowSec + 3600,
    })
  );
  const signer = createSign('RSA-SHA256');
  signer.update(`${header}.${claims}`);
  return `${header}.${claims}.${base64url(signer.sign(account.privateKey))}`;
}

export class FcmNotifier implements Notifier {
  readonly enabled = true;
  private token: { value: string; expiresAt: number } | null = null;

  constructor(
    private readonly account: ServiceAccount,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly now: () => number = Date.now
  ) {}

  private async accessToken(): Promise<string> {
    if (this.token && this.token.expiresAt > this.now() + 60_000) return this.token.value;
    const response = await this.fetchImpl(TOKEN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: serviceAccountJwt(this.account, Math.floor(this.now() / 1000)),
      }),
    });
    if (!response.ok) throw new Error(`FCM token exchange failed (${response.status})`);
    const body = (await response.json()) as { access_token: string; expires_in: number };
    this.token = {
      value: body.access_token,
      expiresAt: this.now() + body.expires_in * 1000,
    };
    return body.access_token;
  }

  async send(target: PushTarget, message: PushMessage): Promise<SendResult> {
    const deviceToken = target.endpoint.slice(FCM_PREFIX.length);
    const response = await this.fetchImpl(
      `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(this.account.projectId)}/messages:send`,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${await this.accessToken()}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          message: {
            token: deviceToken,
            notification: { title: message.title, body: message.body },
            data: { url: message.url, tag: message.tag },
            android: { collapse_key: message.tag, notification: { tag: message.tag } },
            apns: { headers: { 'apns-collapse-id': message.tag } },
          },
        }),
      }
    );
    if (response.ok) return 'sent';
    // The app was uninstalled or the token rotated: forget the device.
    if (response.status === 404) return 'gone';
    const error = (await response.json().catch(() => null)) as {
      error?: { details?: { errorCode?: string }[] };
    } | null;
    if (error?.error?.details?.some((d) => d.errorCode === 'UNREGISTERED')) return 'gone';
    return 'failed';
  }
}

/** Sends web push and app push through one Notifier, by the kind of endpoint. */
export class RoutingNotifier implements Notifier {
  constructor(
    private readonly web: Notifier,
    private readonly app: Notifier
  ) {}

  get enabled(): boolean {
    return this.web.enabled || this.app.enabled;
  }

  send(target: PushTarget, message: PushMessage): Promise<SendResult> {
    const channel = target.endpoint.startsWith(FCM_PREFIX) ? this.app : this.web;
    return channel.enabled ? channel.send(target, message) : Promise.resolve('failed');
  }
}
