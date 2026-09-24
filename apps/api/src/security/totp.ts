/**
 * Time-based one-time passwords (RFC 6238, HMAC-SHA1, 30 s, 6 digits) – what authenticator
 * apps (Google Authenticator, Aegis, 1Password, …) implement. Used as the second factor for
 * admins (ADR-0009, story 4.2). Small enough to own rather than add a dependency.
 */
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export const TOTP_PERIOD_SEC = 30;
export const TOTP_DIGITS = 6;
/** Accept the previous and next code as well: phone clocks drift. */
const WINDOW = 1;

export function base32Encode(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(text: string): Buffer {
  const clean = text.replace(/[\s=]/g, '').toUpperCase();
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const char of clean) {
    const index = BASE32.indexOf(char);
    if (index < 0) throw new RangeError('invalid base32');
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** A new random secret (160 bits, as RFC 4226 recommends), base32 for the authenticator app. */
export function newTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

/** The code for a time step (HOTP of the step counter). */
export function totpAt(secret: Buffer, step: number, digits = TOTP_DIGITS): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const hmac = createHmac('sha1', secret).update(counter).digest();
  const offset = hmac[hmac.length - 1]! & 0x0f;
  const binary = hmac.readUInt32BE(offset) & 0x7fffffff;
  return String(binary % 10 ** digits).padStart(digits, '0');
}

export function stepAt(timeMs: number): number {
  return Math.floor(timeMs / 1000 / TOTP_PERIOD_SEC);
}

/**
 * Checks a code entered by the user. Returns the matched time step (to refuse replaying the
 * same code) or null. Constant-time comparison for every candidate.
 */
export function verifyTotp(
  secretBase32: string,
  code: string,
  timeMs = Date.now()
): number | null {
  if (!/^\d{6}$/.test(code)) return null;
  const secret = base32Decode(secretBase32);
  const now = stepAt(timeMs);
  let matched: number | null = null;
  for (let step = now - WINDOW; step <= now + WINDOW; step++) {
    if (timingSafeEqual(Buffer.from(totpAt(secret, step)), Buffer.from(code)))
      matched = step;
  }
  return matched;
}

/** The otpauth:// URI authenticator apps read from a QR code. */
export function otpauthUri(
  secretBase32: string,
  account: string,
  issuer = 'Suffa'
): string {
  const label = encodeURIComponent(`${issuer}:${account}`);
  const params = new URLSearchParams({
    secret: secretBase32,
    issuer,
    algorithm: 'SHA1',
    digits: String(TOTP_DIGITS),
    period: String(TOTP_PERIOD_SEC),
  });
  return `otpauth://totp/${label}?${params}`;
}
