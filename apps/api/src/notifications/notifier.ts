/**
 * Notifier abstraction (story 6.3): how a message reaches a device. Web Push today; native
 * push (ADR-0019) implements the same interface later.
 */
import webpush from 'web-push';

export interface PushTarget {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface PushMessage {
  title: string;
  body: string;
  /** In-app path opened by a tap. */
  url: string;
  /** Replaces an older notification with the same tag on the device. */
  tag: string;
}

/** sent; gone = the device unsubscribed (delete it); failed = try again another time. */
export type SendResult = 'sent' | 'gone' | 'failed';

export interface Notifier {
  readonly enabled: boolean;
  send(target: PushTarget, message: PushMessage): Promise<SendResult>;
}

/** Push is not configured: nothing is sent. */
export const disabledNotifier: Notifier = {
  enabled: false,
  send: async () => 'failed',
};

/** A notification should reach the device within a day or not at all. */
const TTL_SECONDS = 24 * 60 * 60;

export class WebPushNotifier implements Notifier {
  readonly enabled = true;

  constructor(
    private readonly vapid: { publicKey: string; privateKey: string; subject: string },
    private readonly push: Pick<typeof webpush, 'sendNotification'> = webpush
  ) {}

  async send(target: PushTarget, message: PushMessage): Promise<SendResult> {
    try {
      await this.push.sendNotification(
        { endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.auth } },
        JSON.stringify(message),
        { TTL: TTL_SECONDS, vapidDetails: this.vapid }
      );
      return 'sent';
    } catch (error) {
      if (error instanceof webpush.WebPushError) {
        // 404/410: the subscription expired or the user revoked the permission.
        return error.statusCode === 404 || error.statusCode === 410 ? 'gone' : 'failed';
      }
      throw error;
    }
  }
}
