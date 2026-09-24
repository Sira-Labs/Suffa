/**
 * Every API route and what it needs (ADR-0009). The matrix test compares this list with the
 * routes the app actually registers, so a new route cannot ship without a policy decision.
 */
import type { Action } from './policies.js';

export interface RoutePolicy {
  method: 'GET' | 'POST';
  path: string;
  action: Action;
}

/** Routes behind `authorize()`: 401 without sign-in, 403 without the permission. */
export const PROTECTED_ROUTES: readonly RoutePolicy[] = [
  { method: 'GET', path: '/api/v1/me', action: 'profile:read' },
  { method: 'POST', path: '/api/v1/sync/:table/push', action: 'sync:own' },
  { method: 'GET', path: '/api/v1/sync/:table/pull', action: 'sync:own' },
  { method: 'GET', path: '/api/v1/admin/users', action: 'admin:users:read' },
];

/**
 * Routes open to everyone: health and version for the platform, browser error reports, and
 * the sign-in flow itself (Better Auth guards its own endpoints with rate limits).
 */
export const PUBLIC_ROUTES: readonly string[] = [
  'GET /healthz',
  'GET /api/healthz',
  'GET /api/version',
  'GET /api/client-config',
  'POST /api/errors',
  'GET /api/v1/auth/*',
  'POST /api/v1/auth/*',
];
