/**
 * CORS for the native app's web view (ADR-0019). The app runs the same web build from
 * capacitor://localhost (iOS) or https://localhost (Android) and calls the API with a bearer
 * token: its origins get CORS answers without credentials, so a cookie is never sent or set
 * cross-origin. Every other origin gets no CORS headers at all.
 */
import type { MiddlewareHandler } from 'hono';

const ALLOWED_HEADERS = 'authorization, content-type, accept';
const EXPOSED_HEADERS = 'set-auth-token';

export function appCors(origins: readonly string[]): MiddlewareHandler {
  const allowed = new Set(origins);
  return async (c, next) => {
    const origin = c.req.header('origin');
    if (!origin || !allowed.has(origin)) return next();
    if (c.req.method === 'OPTIONS') {
      return c.body(null, 204, {
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE',
        'Access-Control-Allow-Headers': ALLOWED_HEADERS,
        'Access-Control-Max-Age': '600',
        Vary: 'Origin',
      });
    }
    await next();
    c.res.headers.set('Access-Control-Allow-Origin', origin);
    const exposed = new Set(
      (c.res.headers.get('Access-Control-Expose-Headers') ?? '')
        .split(',')
        .map((h) => h.trim())
        .filter(Boolean)
    );
    exposed.add(EXPOSED_HEADERS);
    c.res.headers.set('Access-Control-Expose-Headers', [...exposed].join(', '));
    c.res.headers.append('Vary', 'Origin');
  };
}
