/**
 * Every API route and what it needs (ADR-0009). The matrix test compares this list with the
 * routes the app actually registers, so a new route cannot ship without a policy decision.
 */
import type { Action } from './policies.js';

export interface RoutePolicy {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
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
  { method: 'GET', path: '/api/v1/account/passkeys', action: 'profile:read' },
  { method: 'DELETE', path: '/api/v1/account/passkeys/:id', action: 'profile:write' },
  { method: 'POST', path: '/api/v1/sync/:table/push', action: 'sync:own' },
  { method: 'GET', path: '/api/v1/sync/:table/pull', action: 'sync:own' },
  { method: 'GET', path: '/api/v1/engagement', action: 'sync:own' },
  { method: 'GET', path: '/api/v1/tutor', action: 'tutor:use' },
  { method: 'PUT', path: '/api/v1/tutor/settings', action: 'tutor:use' },
  { method: 'POST', path: '/api/v1/tutor/turn', action: 'tutor:use' },
  { method: 'GET', path: '/api/v1/tutor/conversations/:id', action: 'tutor:use' },
  { method: 'DELETE', path: '/api/v1/tutor/conversations/:id', action: 'tutor:use' },
  { method: 'PUT', path: '/api/v1/tutor/messages/:id/rating', action: 'tutor:use' },
  { method: 'POST', path: '/api/v1/tutor/grade', action: 'tutor:use' },
  { method: 'GET', path: '/api/v1/tutor/grades', action: 'tutor:use' },
  { method: 'GET', path: '/api/v1/classes/:id/grades', action: 'class:progress:read' },
  {
    method: 'GET',
    path: '/api/v1/classes/:id/grades/export',
    action: 'class:progress:read',
  },
  { method: 'PUT', path: '/api/v1/classes/:id/grades/:gradeId', action: 'class:manage' },
  {
    method: 'POST',
    path: '/api/v1/classes/:id/media/:mediaId/suggestions',
    action: 'class:manage',
  },
  {
    method: 'POST',
    path: '/api/v1/classes/:id/media/:mediaId/summary',
    action: 'class:manage',
  },
  {
    method: 'PUT',
    path: '/api/v1/classes/:id/media/:mediaId/summary',
    action: 'class:manage',
  },
  {
    method: 'GET',
    path: '/api/v1/classes/:id/media/:mediaId/suggestions',
    action: 'class:manage',
  },
  {
    method: 'PUT',
    path: '/api/v1/classes/:id/media/:mediaId/suggestions/:sid',
    action: 'class:manage',
  },
  {
    method: 'DELETE',
    path: '/api/v1/classes/:id/media/:mediaId/chapters/:chapterId',
    action: 'class:manage',
  },
  { method: 'GET', path: '/api/v1/admin/users', action: 'admin:users:read' },
  { method: 'PATCH', path: '/api/v1/admin/users/:id', action: 'admin:users:write' },
  { method: 'GET', path: '/api/v1/admin/audit', action: 'admin:audit:read' },
  { method: 'GET', path: '/api/v1/admin/ai', action: 'admin:ai:read' },
  { method: 'PUT', path: '/api/v1/admin/ai/routes/:task', action: 'admin:ai:write' },
  { method: 'PUT', path: '/api/v1/admin/ai/settings', action: 'admin:ai:write' },
  { method: 'POST', path: '/api/v1/admin/ai/try', action: 'admin:ai:write' },
  { method: 'GET', path: '/api/v1/admin/videos', action: 'admin:videos' },
  { method: 'POST', path: '/api/v1/admin/videos/channels', action: 'admin:videos' },
  { method: 'PATCH', path: '/api/v1/admin/videos/channels/:id', action: 'admin:videos' },
  {
    method: 'POST',
    path: '/api/v1/admin/videos/channels/:id/import',
    action: 'admin:videos',
  },
  { method: 'PATCH', path: '/api/v1/admin/videos/:videoId', action: 'admin:videos' },
  {
    method: 'PUT',
    path: '/api/v1/admin/videos/:videoId/transcript',
    action: 'admin:videos',
  },
  {
    method: 'POST',
    path: '/api/v1/admin/videos/:videoId/checkpoints',
    action: 'admin:videos',
  },
  {
    method: 'DELETE',
    path: '/api/v1/admin/videos/:videoId/checkpoints/:cpId',
    action: 'admin:videos',
  },
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
  { method: 'GET', path: '/api/v1/classes/:id/progress', action: 'class:progress:read' },
  { method: 'GET', path: '/api/v1/classes/:id/feed', action: 'class:read' },
  { method: 'GET', path: '/api/v1/classes/:id/league', action: 'class:read' },
  { method: 'GET', path: '/api/v1/classes/:id/certificates', action: 'class:manage' },
  { method: 'POST', path: '/api/v1/classes/:id/certificates', action: 'class:manage' },
  {
    method: 'DELETE',
    path: '/api/v1/classes/:id/certificates/:certificateId',
    action: 'class:manage',
  },
  { method: 'GET', path: '/api/v1/certificates', action: 'profile:read' },
  { method: 'GET', path: '/api/v1/classes/:id/quiz', action: 'class:read' },
  { method: 'GET', path: '/api/v1/classes/:id/quiz/events', action: 'class:read' },
  { method: 'POST', path: '/api/v1/classes/:id/quiz', action: 'class:manage' },
  { method: 'POST', path: '/api/v1/classes/:id/quiz/next', action: 'class:manage' },
  { method: 'POST', path: '/api/v1/classes/:id/quiz/reveal', action: 'class:manage' },
  { method: 'POST', path: '/api/v1/classes/:id/quiz/finish', action: 'class:manage' },
  { method: 'POST', path: '/api/v1/classes/:id/quiz/join', action: 'class:read' },
  { method: 'POST', path: '/api/v1/classes/:id/quiz/answer', action: 'class:read' },
  { method: 'PUT', path: '/api/v1/classes/:id/league/opt-in', action: 'class:read' },
  { method: 'GET', path: '/api/v1/classes/:id/league/settings', action: 'class:manage' },
  { method: 'PUT', path: '/api/v1/classes/:id/league/settings', action: 'class:manage' },
  { method: 'PUT', path: '/api/v1/classes/:id/challenge', action: 'class:manage' },
  { method: 'DELETE', path: '/api/v1/classes/:id/challenge', action: 'class:manage' },
  { method: 'POST', path: '/api/v1/classes/:id/badges', action: 'class:manage' },
  {
    method: 'POST',
    path: '/api/v1/classes/:id/badges/:badgeId/awards',
    action: 'class:manage',
  },
  { method: 'POST', path: '/api/v1/classes/:id/shoutouts', action: 'class:manage' },
  {
    method: 'DELETE',
    path: '/api/v1/classes/:id/shoutouts/:shoutoutId',
    action: 'class:manage',
  },
  { method: 'GET', path: '/api/v1/classes/:id/media', action: 'class:read' },
  { method: 'POST', path: '/api/v1/classes/:id/media', action: 'class:manage' },
  {
    method: 'POST',
    path: '/api/v1/classes/:id/media/:mediaId/parts',
    action: 'class:manage',
  },
  {
    method: 'GET',
    path: '/api/v1/classes/:id/media/:mediaId/parts',
    action: 'class:manage',
  },
  {
    method: 'POST',
    path: '/api/v1/classes/:id/media/:mediaId/complete',
    action: 'class:manage',
  },
  {
    method: 'POST',
    path: '/api/v1/classes/:id/media/:mediaId/publish',
    action: 'class:manage',
  },
  {
    method: 'DELETE',
    path: '/api/v1/classes/:id/media/:mediaId',
    action: 'class:manage',
  },
  {
    method: 'GET',
    path: '/api/v1/classes/:id/media/:mediaId/play',
    action: 'class:read',
  },
  {
    method: 'GET',
    path: '/api/v1/classes/:id/media/:mediaId/interactive',
    action: 'class:read',
  },
  {
    method: 'PUT',
    path: '/api/v1/classes/:id/media/:mediaId/transcript',
    action: 'class:manage',
  },
  {
    method: 'POST',
    path: '/api/v1/classes/:id/media/:mediaId/transcript/generate',
    action: 'class:manage',
  },
  {
    method: 'POST',
    path: '/api/v1/classes/:id/media/:mediaId/checkpoints',
    action: 'class:manage',
  },
  {
    method: 'DELETE',
    path: '/api/v1/classes/:id/media/:mediaId/checkpoints/:checkpointId',
    action: 'class:manage',
  },
  { method: 'GET', path: '/api/v1/classes/:id/assignments', action: 'class:read' },
  { method: 'POST', path: '/api/v1/classes/:id/assignments', action: 'class:manage' },
  {
    method: 'DELETE',
    path: '/api/v1/classes/:id/assignments/:assignmentId',
    action: 'class:manage',
  },
  { method: 'GET', path: '/api/v1/classes/:id/settings', action: 'class:manage' },
  { method: 'PATCH', path: '/api/v1/classes/:id/settings', action: 'class:manage' },
  { method: 'GET', path: '/api/v1/drive', action: 'class:create' },
  { method: 'GET', path: '/api/v1/drive/connect', action: 'class:create' },
  { method: 'GET', path: '/api/v1/drive/callback', action: 'class:create' },
  { method: 'POST', path: '/api/v1/drive/token', action: 'class:create' },
  { method: 'DELETE', path: '/api/v1/drive', action: 'class:create' },
  { method: 'POST', path: '/api/v1/classes/:id/media/drive', action: 'class:manage' },
  { method: 'GET', path: '/api/v1/notifications', action: 'profile:read' },
  { method: 'PUT', path: '/api/v1/notifications/preferences', action: 'profile:write' },
  {
    method: 'POST',
    path: '/api/v1/notifications/subscriptions',
    action: 'profile:write',
  },
  {
    method: 'DELETE',
    path: '/api/v1/notifications/subscriptions',
    action: 'profile:write',
  },
  { method: 'POST', path: '/api/v1/notifications/devices', action: 'profile:write' },
  { method: 'DELETE', path: '/api/v1/notifications/devices', action: 'profile:write' },
  { method: 'GET', path: '/api/v1/recaps/latest', action: 'profile:read' },
  { method: 'GET', path: '/api/v1/invites/:token', action: 'class:join' },
  { method: 'POST', path: '/api/v1/invites/:token/join', action: 'class:join' },
  { method: 'GET', path: '/api/v1/account/2fa', action: 'profile:read' },
  { method: 'GET', path: '/api/v1/account/export', action: 'profile:read' },
  { method: 'DELETE', path: '/api/v1/account', action: 'profile:write' },
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
  // The video catalog is public (ADR-0012); interactive parts depend on the creator's permission.
  'GET /api/v1/videos',
  'GET /api/v1/videos/:id',
  // Universal Links / App Links files for the native app (ADR-0019).
  'GET /api/v1/app-links/apple-app-site-association',
  'GET /api/v1/app-links/assetlinks.json',
];
