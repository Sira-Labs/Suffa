/**
 * Route × role matrix (ADR-0009, story 3.2): every route the app registers is either public
 * or protected by a declared action, and every protected route answers each role exactly as
 * the policies say – 401 anonymous, 403 not allowed, anything else when allowed.
 */
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { AccountRepository } from '../src/account/repository.js';
import { ModelRouter } from '@suffa/llm';
import type { AdminRepository } from '../src/admin/repository.js';
import { AiGateway } from '../src/ai/gateway.js';
import type { AiRepository } from '../src/ai/repository.js';
import type { ClassRepository } from '../src/classes/repository.js';
import type { PrivacyRepository } from '../src/privacy/repository.js';
import { SecondFactorService } from '../src/account/secondFactor.js';
import { SecretBox } from '../src/security/secretBox.js';
import type { Me } from '../src/auth/betterAuth.js';
import type { AuthResolver } from '../src/auth/resolver.js';
import { can, ROLES, SECOND_FACTOR_ACTIONS, type Role } from '../src/authz/policies.js';
import { PROTECTED_ROUTES, PUBLIC_ROUTES } from '../src/authz/routes.js';
import type { SyncRepository } from '../src/sync/repository.js';

const USER_ID = '33333333-3333-4333-8333-333333333333';
const quiet = { info: () => {}, warn: () => {}, error: () => {} };

/**
 * The test picks the caller's role with a header; no header means anonymous. Sessions have
 * confirmed their second factor unless `x-test-2fa: no`.
 */
function actorFrom(headers: Headers): (Me & { secondFactor: boolean }) | null {
  const role = headers.get('x-test-role') as Role | null;
  return role
    ? {
        id: USER_ID,
        email: 'x@example.org',
        name: null,
        role,
        timeZone: null,
        secondFactor: headers.get('x-test-2fa') !== 'no',
      }
    : null;
}
const resolver: AuthResolver = { actor: async (h) => actorFrom(h) };

const syncRepo: SyncRepository = {
  upsert: async (_u, _t, records) => records.length,
  pull: async () => ({ records: [], next: null, watermark: null }),
};
const adminRepo: AdminRepository = {
  listUsers: async () => ({ users: [], next: null }),
  updateUser: async () => null,
  listAudit: async () => ({ entries: [], next: null }),
};
const privacyRepo: PrivacyRepository = {
  export: async () => ({
    exportedAt: '2026-09-24T00:00:00.000Z',
    profile: {},
    secondFactorEnabled: false,
    sessions: [],
    classes: [],
    learningData: {} as never,
    engagement: { state: null, xpLedger: [], quests: [], achievements: [] },
    classRecognition: { badges: [], shoutouts: [], challenges: [] },
    notifications: { prefs: null, devices: [], recaps: [] },
    auditLog: [],
  }),
  delete: async () => true,
};

/** Nobody is a member of any class here: class:manage is left to admins. */
const classRepo: ClassRepository = {
  create: async () => ({
    id: 'c',
    name: 'x',
    classRole: 'teacher',
    status: 'active',
    studentCount: 0,
    pendingCount: 0,
    createdAt: '2026-09-24T00:00:00.000Z',
  }),
  listFor: async () => [],
  scope: async () => ({ classRole: null }),
  createInvite: async () => ({ token: 't', expiresAt: '2026-10-08T00:00:00.000Z' }),
  members: async () => [],
  approve: async () => false,
  remove: async () => false,
  preview: async () => null,
  join: async () => ({ ok: false, reason: 'invalid_invite' }),
};
const secondFactor = new SecondFactorService(
  {
    get: async () => null,
    savePending: async () => true,
    confirm: async () => ({ accepted: true, newlyEnabled: false }),
    recordFailure: async () => {},
  },
  new SecretBox('s'.repeat(40), 'totp')
);
const accountRepo: AccountRepository = {
  listSessions: async () => [],
  revokeSession: async () => true,
  revokeOtherSessions: async () => 0,
  setTimeZone: async () => {},
};
const sessionActors = {
  actor: async (h: Headers) => {
    const me = actorFrom(h);
    return me
      ? {
          id: me.id,
          role: me.role,
          sessionId: 'session-1',
          email: me.email,
          secondFactor: me.secondFactor,
        }
      : null;
  },
};

function buildApp() {
  return createApp({
    version: 'test',
    expectedRevision: null,
    health: {
      schemaRevision: async () => null,
      queueDepth: async () => ({ waiting: 0, active: 0, failed: 0, deadLetter: 0 }),
    },
    sync: { repo: syncRepo, auth: resolver, log: quiet },
    media: {
      classes: classRepo,
      repo: {
        create: async () => ({}) as never,
        get: async () => null,
        byId: async () => null,
        creator: async () => null,
        list: async () => [],
        classBytes: async () => 0,
        update: async () => {},
        publish: async () => {},
        remove: async () => {},
      },
      media: {
        start: async () => ({ ok: false, reason: 'unsupported_type' }),
        partUrls: async () => ({}),
        uploadedParts: async () => [],
        complete: async () => false,
        remove: async () => {},
        playUrls: async () => ({ audio: '', video: null }),
      },
      audit: { query: async () => ({}) } as never,
      auth: resolver,
      log: quiet,
    },
    drive: {
      drive: {
        connected: async () => false,
        accessToken: async () => null,
        disconnect: async () => false,
        connect: async () => {},
        import: async () => ({ ok: false, reason: 'not_connected' }),
      } as never,
      google: { authUrl: () => 'https://accounts.google.com/o/oauth2/v2/auth' },
      classes: classRepo,
      picker: { apiKey: 'k', appId: '1' },
      stateSecret: 's'.repeat(40),
      auth: resolver,
      log: quiet,
    },
    assignments: {
      classes: classRepo,
      repo: { list: async () => [], create: async () => null, remove: async () => false },
      auth: resolver,
      log: quiet,
    },
    interactive: {
      classes: classRepo,
      media: {
        create: async () => ({}) as never,
        get: async () => null,
        byId: async () => null,
        creator: async () => null,
        list: async () => [],
        classBytes: async () => 0,
        update: async () => {},
        publish: async () => {},
        remove: async () => {},
      },
      interactive: {
        transcript: async () => null,
        saveTranscript: async () => {},
        checkpoints: async () => [],
        addCheckpoint: async () => ({}) as never,
        removeCheckpoint: async () => false,
        aiEnabled: async () => true,
        setAiEnabled: async () => {},
      },
      auth: resolver,
      log: quiet,
    },
    notifications: {
      repo: {
        subscribe: async () => {},
        unsubscribe: async () => true,
        prefs: async () => ({
          reminderEnabled: false,
          reminderTime: '18:00',
          quietStart: '22:00',
          quietEnd: '07:00',
          weeklyRecap: true,
          devices: 0,
        }),
        savePrefs: async () => {},
        recipients: async () => [],
        targets: async () => [],
        doneOn: async () => false,
        claim: async () => true,
        delivered: async () => {},
      },
      recaps: { latest: async () => null },
      publicKey: 'BPublic',
      auth: resolver,
      log: quiet,
    },
    classSpirit: {
      classes: classRepo,
      progress: {
        progress: async () => ({ since: '', students: [], matureByRef: {}, leeches: [] }),
      },
      spirit: {
        feed: async () => ({ challenge: null, shoutouts: [], badges: [] }),
        setChallenge: async () => ({}) as never,
        removeChallenge: async () => false,
        createBadge: async () => ({}) as never,
        award: async () => false,
        shoutout: async () => null,
        removeShoutout: async () => false,
      },
      auth: resolver,
      log: quiet,
    },
    engagement: {
      repo: { load: async () => null, save: async () => {}, state: async () => null },
      auth: resolver,
      log: quiet,
    },
    admin: { repo: adminRepo, auth: resolver, log: quiet },
    aiAdmin: (() => {
      const repo: AiRepository = {
        load: async () => [],
        replaceRoutes: async () => {},
        settings: async () => ({
          monthlyBudgetMicro: 1,
          downgradePercent: 80,
          dailyTurns: { student: 1, teacher: 1, admin: null },
        }),
        updateSettings: async () => {},
        monthSpend: async () => 0,
        turnsToday: async () => 0,
        record: async () => {},
        usageByTask: async () => [],
      };
      const router = new ModelRouter({ providers: {}, source: repo });
      return {
        repo,
        router,
        gateway: new AiGateway({ router, repo, log: quiet }),
        configured: [],
        auth: resolver,
        log: quiet,
      };
    })(),
    classes: {
      repo: classRepo,
      auth: resolver,
      log: quiet,
      publicUrl: 'https://s.example',
    },
    account: {
      repo: accountRepo,
      sessions: sessionActors,
      secondFactor,
      privacy: privacyRepo,
      log: quiet,
    },
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
  const path = route.path.replace(':table', 'srs_cards').replace(':id', 'session-2');
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (role) headers['x-test-role'] = role;
  return new Request(`http://localhost${path}`, {
    method: route.method,
    headers,
    body:
      route.method === 'POST' || route.method === 'PATCH'
        ? JSON.stringify(
            route.method === 'POST' ? { records: [], name: 'x' } : { timeZone: 'UTC' }
          )
        : route.method === 'PUT'
          ? JSON.stringify({ template: 'xp', target: 100, timeZone: 'UTC' })
          : undefined,
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

  it('admin actions also need a confirmed second factor in this session', async () => {
    for (const route of PROTECTED_ROUTES.filter((r) =>
      SECOND_FACTOR_ACTIONS.has(r.action)
    )) {
      const request = requestFor(route, 'admin');
      request.headers.set('x-test-2fa', 'no');
      const response = await app.request(request);
      expect(response.status, route.path).toBe(403);
      expect(await response.json()).toEqual({ error: 'second_factor_required' });
    }
  });

  it('/me returns the profile of the signed-in user', async () => {
    const response = await app.request(
      requestFor({ method: 'GET', path: '/api/v1/me' }, 'teacher')
    );
    expect(await response.json()).toMatchObject({ id: USER_ID, role: 'teacher' });
    expect(response.headers.get('cache-control')).toBe('no-store');
  });

  it('exposes only the Better Auth endpoints magic-link sign-in needs', async () => {
    const call = (method: string, path: string) =>
      app.request(`/api/v1/auth${path}`, {
        method,
        headers: { 'content-type': 'application/json' },
      });
    expect((await call('POST', '/sign-in/magic-link')).status).toBe(200);
    expect((await call('GET', '/magic-link/verify')).status).toBe(200);
    expect((await call('POST', '/sign-out')).status).toBe(200);
    for (const [method, path] of [
      ['GET', '/get-session'],
      ['GET', '/list-sessions'],
      ['POST', '/update-user'],
      ['POST', '/delete-user'],
      ['POST', '/change-email'],
      ['POST', '/sign-up/email'],
      ['POST', '/revoke-sessions'],
      ['GET', '/magic-link/verify/extra'],
    ] as const) {
      expect((await call(method, path)).status, `${method} ${path}`).toBe(404);
    }
  });
});
