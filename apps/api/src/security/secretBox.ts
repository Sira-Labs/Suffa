/**
 * Encrypts small secrets at rest (AES-256-GCM), e.g. an admin's TOTP secret: a database dump
 * alone must not let anyone generate valid codes. The key is derived from SUFFA_AUTH_SECRET
 * with HKDF and a purpose label, so no extra variable is needed; rotating the auth secret
 * means admins enrol their authenticator again.
 */
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';

const VERSION = 'v1';

export class SecretBox {
  private readonly key: Buffer;

  constructor(masterSecret: string, purpose: string) {
    if (masterSecret.length < 32) throw new RangeError('master secret too short');
    this.key = Buffer.from(
      hkdfSync('sha256', masterSecret, 'suffa-secret-box', purpose, 32)
    );
  }

  seal(plaintext: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const data = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return [VERSION, iv, tag, data]
      .map((p) => (typeof p === 'string' ? p : p.toString('base64url')))
      .join('.');
  }

  /** Throws when the value was tampered with or sealed with another key. */
  open(sealed: string): string {
    const [version, iv, tag, data] = sealed.split('.');
    if (version !== VERSION || !iv || !tag || data === undefined) {
      throw new RangeError('unknown sealed format');
    }
    const decipher = createDecipheriv(
      'aes-256-gcm',
      this.key,
      Buffer.from(iv, 'base64url')
    );
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([
      decipher.update(Buffer.from(data, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
  }
}
