/**
 * Defence in depth against cross-site request forgery. The session cookie is SameSite=Lax,
 * so browsers already leave it off cross-site POSTs; this guard also refuses any state-changing
 * request a browser marks as coming from another site, whatever the cookie settings become.
 * Requests without these headers (curl, the mobile app, tests) are not browser-forged and pass.
 */
import type { MiddlewareHandler } from 'hono';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export function sameOriginOnly(allowedOrigin: string): MiddlewareHandler {
  return async (c, next) => {
    if (SAFE_METHODS.has(c.req.method)) return next();
    const origin = c.req.header('origin');
    const site = c.req.header('sec-fetch-site');
    const foreign =
      (origin !== undefined && origin !== allowedOrigin) ||
      (origin === undefined &&
        site !== undefined &&
        site !== 'same-origin' &&
        site !== 'none');
    if (foreign) return c.json({ error: 'cross_origin' }, 403);
    return next();
  };
}
