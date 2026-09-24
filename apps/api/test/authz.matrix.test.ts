/**
 * Route × role matrix (ADR-0009, story 3.2): every route the app registers is either public
 * or protected by a declared action, and every protected route answers each role exactly as
 * the policies say – 401 anonymous, 403 not allowed, anything else when allowed.
 */
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { AdminRepository } from '../src/admin/repository.js';
import type { Me } from '../src/auth/betterAuth.js';
import type { AuthResolver } from '../src/auth/resolver.js';
import { can, ROLES, type Role } from '../src/authz/policies.js';
import { PROTECTED_ROUTES, PUBLIC_ROUTES } from '../src/authz/routes.js';
import type { SyncRepository } from '../src/sync/repository.js';

const USER_ID = '33333333-3333-4333-8333-333333333333';
const quiet = { info: () => {}, warn: () => {}, error: () => {} };

/** The test picks the caller's role with a header; no header means anonymous. */
function actorFrom(headers: Headers): Me | null {
  const role = headers.get('x-test-role') as Role | null;
  return role ? { id: USER_ID, email: 'x@example.org', name: null, role } : null;
}
const resolver: AuthResolver = { actor: async (h) => actorFrom(h) };

const syncRepo: SyncRepository = {
  upsert: async (_u, _t, records) => records.length,
  pull: async () => ({ records: [], next: null }),
};
const adminRepo: AdminRepository = { listUsers: async () => ({ users: [], next: null }) };

function buildApp() {
  return createApp({
    version: 'test',
    expectedRevision: null,
    health: {
      schemaRevision: async () => null,
      queueDepth: async () => ({ waiting: 0, active: 0, failed: 0, deadLetter: 0 }),
    },
    sync: { repo: syncRepo, auth: resolver, log: quiet },
    admin: { repo: adminRepo, auth: resolver, log: quiet },
    auth: {
      handler: async () => Response.json({ ok: true }),
      me: async (h) => actorFrom(h),
    },
    errorTunnel: { webDsn: undefined, log: quiet },
    authzLog: quiet,
  });
}

/** A concrete request for a route pattern (fills in path parameters). */
function requestFor(route: { method: string; path: string }, role: Role | null) {
  const path = route.path.replace(':table', 'srs_cards');
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (role) headers['x-test-role'] = role;
  return new Request(`http://localhost${path}`, {
    method: route.method,
    headers,
    body: route.method === 'POST' ? JSON.stringify({ records: [] }) : undefined,
  });
}

describe('route × role matrix', () => {
  const app = buildApp();

  it('has a policy decision for every registered route', () => {
    const registered = new Set(
      app.routes.filter((r) => r.method !== 'ALL').map((r) => `${r.method} ${r.path}`)
    );
    const declared = new Set([
      ...PROTECTED_ROUTES.map((r) => `${r.method} ${r.path}`),
      ...PUBLIC_ROUTES,
    ]);
    expect([...registered].filter((r) => !declared.has(r))).toEqual([]);
    expect([...declared].filter((r) => !registered.has(r))).toEqual([]);
  });

  for (const route of PROTECTED_ROUTES) {
    it(`${route.method} ${route.path}: anonymous → 401`, async () => {
      expect((await app.request(requestFor(route, null))).status).toBe(401);
    });
    for (const role of ROLES) {
      const allowed = can({ id: USER_ID, role }, route.action);
      it(`${route.method} ${route.path}: ${role} → ${allowed ? 'allowed' : '403'}`, async () => {
        const { status } = await app.request(requestFor(route, role));
        if (allowed) expect([401, 403]).not.toContain(status);
        else expect(status).toBe(403);
      });
    }
  }

  it('/me returns the profile of the signed-in user', async () => {
    const response = await app.request(
      requestFor({ method: 'GET', path: '/api/v1/me' }, 'teacher')
    );
    expect(await response.json()).toMatchObject({ id: USER_ID, role: 'teacher' });
    expect(response.headers.get('cache-control')).toBe('no-store');
  });
});
