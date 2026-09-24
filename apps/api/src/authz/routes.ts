/**
 * Every API route and what it needs (ADR-0009). The matrix test compares this list with the
 * routes the app actually registers, so a new route cannot ship without a policy decision.
 */
import type { Action } from './policies.js';

export interface RoutePolicy {
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  path: string;
  action: Action;
}

/** Routes behind `authorize()`: 401 without sign-in, 403 without the permission. */
export const PROTECTED_ROUTES: readonly RoutePolicy[] = [
  { method: 'GET', path: '/api/v1/me', action: 'profile:read' },
  { method: 'GET', path: '/api/v1/account/sessions', action: 'profile:read' },
  {
    method: 'POST',
    path: '/api/v1/account/sessions/revoke-others',
    action: 'profile:write',
  },
  { method: 'DELETE', path: '/api/v1/account/sessions/:id', action: 'profile:write' },
  { method: 'PATCH', path: '/api/v1/account/settings', action: 'profile:write' },
  { method: 'POST', path: '/api/v1/sync/:table/push', action: 'sync:own' },
  { method: 'GET', path: '/api/v1/sync/:table/pull', action: 'sync:own' },
  { method: 'GET', path: '/api/v1/admin/users', action: 'admin:users:read' },
  { method: 'PATCH', path: '/api/v1/admin/users/:id', action: 'admin:users:write' },
  { method: 'GET', path: '/api/v1/admin/audit', action: 'admin:audit:read' },
  { method: 'GET', path: '/api/v1/classes', action: 'class:join' },
  { method: 'POST', path: '/api/v1/classes', action: 'class:create' },
  { method: 'POST', path: '/api/v1/classes/:id/invite', action: 'class:manage' },
  { method: 'GET', path: '/api/v1/classes/:id/members', action: 'class:manage' },
  {
    method: 'POST',
    path: '/api/v1/classes/:id/members/:userId/approve',
    action: 'class:manage',
  },
  {
    method: 'DELETE',
    path: '/api/v1/classes/:id/members/:userId',
    action: 'class:manage',
  },
  { method: 'GET', path: '/api/v1/invites/:token', action: 'class:join' },
  { method: 'POST', path: '/api/v1/invites/:token/join', action: 'class:join' },
  { method: 'GET', path: '/api/v1/account/2fa', action: 'profile:read' },
  { method: 'POST', path: '/api/v1/account/2fa/setup', action: 'profile:write' },
  { method: 'POST', path: '/api/v1/account/2fa/confirm', action: 'profile:write' },
];

/**
 * Routes open to everyone: health and version for the platform, browser error reports, and
 * the sign-in flow itself (only PUBLIC_AUTH_ENDPOINTS pass; Better Auth rate-limits them).
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
