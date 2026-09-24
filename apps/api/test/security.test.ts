import { describe, expect, it } from 'vitest';
import { SecretBox } from '../src/security/secretBox.js';
import {
  base32Decode,
  base32Encode,
  newTotpSecret,
  otpauthUri,
  stepAt,
  totpAt,
  verifyTotp,
} from '../src/security/totp.js';

// RFC 6238 appendix B: SHA1 secret "12345678901234567890", 8 digits.
const RFC_SECRET = Buffer.from('12345678901234567890');
const RFC_VECTORS: [number, string][] = [
  [59, '94287082'],
  [1111111109, '07081804'],
  [1111111111, '14050471'],
  [1234567890, '89005924'],
  [2000000000, '69279037'],
  [20000000000, '65353130'],
];

describe('TOTP', () => {
  it('matches the RFC 6238 test vectors', () => {
    for (const [seconds, code] of RFC_VECTORS) {
      expect(totpAt(RFC_SECRET, stepAt(seconds * 1000), 8)).toBe(code);
    }
  });

  it('round-trips base32 and makes 160-bit secrets', () => {
    expect(base32Decode(base32Encode(RFC_SECRET)).equals(RFC_SECRET)).toBe(true);
    expect(base32Decode(newTotpSecret())).toHaveLength(20);
  });

  it('accepts the current code and one step of clock drift, nothing else', () => {
    const secret = newTotpSecret();
    const now = Date.parse('2026-09-24T12:00:10.000Z');
    const at = (offsetSteps: number) =>
      totpAt(base32Decode(secret), stepAt(now) + offsetSteps);
    expect(verifyTotp(secret, at(0), now)).toBe(stepAt(now));
    expect(verifyTotp(secret, at(-1), now)).toBe(stepAt(now) - 1);
    expect(verifyTotp(secret, at(1), now)).toBe(stepAt(now) + 1);
    expect(verifyTotp(secret, at(3), now)).toBeNull();
    expect(verifyTotp(secret, '12345', now)).toBeNull();
    expect(verifyTotp(secret, 'abcdef', now)).toBeNull();
  });

  it('builds the URI authenticator apps scan', () => {
    const uri = otpauthUri('JBSWY3DPEHPK3PXP', 'chef@example.org');
    expect(uri).toMatch(/^otpauth:\/\/totp\/Suffa%3Achef%40example\.org\?/);
    expect(new URL(uri).searchParams.get('secret')).toBe('JBSWY3DPEHPK3PXP');
  });
});

describe('SecretBox', () => {
  const master = 'm'.repeat(40);

  it('seals and opens, with a fresh IV every time', () => {
    const box = new SecretBox(master, 'totp');
    const a = box.seal('JBSWY3DPEHPK3PXP');
    expect(a).not.toContain('JBSWY3DPEHPK3PXP');
    expect(a).not.toBe(box.seal('JBSWY3DPEHPK3PXP'));
    expect(box.open(a)).toBe('JBSWY3DPEHPK3PXP');
  });

  it('refuses tampered values and other keys or purposes', () => {
    const sealed = new SecretBox(master, 'totp').seal('secret');
    const parts = sealed.split('.');
    parts[3] = Buffer.from('other').toString('base64url');
    expect(() => new SecretBox(master, 'totp').open(parts.join('.'))).toThrow();
    expect(() => new SecretBox('n'.repeat(40), 'totp').open(sealed)).toThrow();
    expect(() => new SecretBox(master, 'other').open(sealed)).toThrow();
  });
});
