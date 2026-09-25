/**
 * The OAuth `state` parameter: binds the consent round trip to the signed-in teacher and
 * expires, so a forged callback cannot connect someone else's Drive.
 */
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const STATE_TTL_MS = 10 * 60 * 1000;

export function signState(
  secret: string,
  userId: string,
  returnTo: string,
  now = Date.now()
) {
  const payload = Buffer.from(
    JSON.stringify({
      u: userId,
      r: returnTo,
      e: now + STATE_TTL_MS,
      n: randomBytes(8).toString('hex'),
    })
  ).toString('base64url');
  const mac = createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${mac}`;
}

export function readState(
  secret: string,
  state: string,
  now = Date.now()
): { userId: string; returnTo: string } | null {
  const [payload, mac] = state.split('.');
  if (!payload || !mac) return null;
  const expected = createHmac('sha256', secret).update(payload).digest();
  const given = Buffer.from(mac, 'base64url');
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      u: string;
      r: string;
      e: number;
    };
    if (data.e < now) return null;
    // Only in-app paths (no open redirect).
    const returnTo = /^\/(?![/\\])/.test(data.r) ? data.r : '/classes';
    return { userId: data.u, returnTo };
  } catch (error) {
    if (error instanceof SyntaxError) return null;
    throw error;
  }
}
