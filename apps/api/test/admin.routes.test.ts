import { describe, expect, it } from 'vitest';
import type { AdminRepository, UserChange, UserQuery } from '../src/admin/repository.js';
import { createAdminRoutes, decodeCursor, encodeCursor } from '../src/admin/routes.js';

const ADMIN = {
  id: '44444444-4444-4444-8444-444444444444',
  role: 'admin',
  secondFactor: true,
} as const;
const quiet = { warn: () => {} };
const OTHER = '66666666-6666-4666-8666-666666666666';

function setup() {
  const queries: UserQuery[] = [];
  const changes: { id: string; change: UserChange }[] = [];
  const repo: AdminRepository = {
    listUsers: async (query) => {
      queries.push(query);
      return {
        users: [],
        next: { createdAt: '2026-09-01T10:00:00.000Z', id: ADMIN.id },
      };
    },
    updateUser: async (id, change) => {
      changes.push({ id, change });
      return id === OTHER
        ? {
            id,
            email: 'b@example.org',
            name: null,
            role: change.role ?? 'student',
            emailVerified: true,
            disabled: change.disabled ?? false,
            createdAt: '2026-09-01T10:00:00.000Z',
          }
        : null;
    },
    listAudit: async () => ({ entries: [], next: null }),
  };
  const app = createAdminRoutes({ repo, auth: { actor: async () => ADMIN }, log: quiet });
  return { app, queries, changes };
}

describe('admin routes', () => {
  it('passes search and limit on and returns an opaque cursor', async () => {
    const { app, queries } = setup();
    const response = await app.request('/users?q=%20amina%20&limit=10');
    expect(response.status).toBe(200);
    expect(queries[0]).toEqual({ search: 'amina', after: null, limit: 10 });
    const { next } = (await response.json()) as { next: string };
    expect(decodeCursor(next)).toEqual({
      createdAt: '2026-09-01T10:00:00.000Z',
      id: ADMIN.id,
    });
  });

  it('continues after the cursor', async () => {
    const { app, queries } = setup();
    const cursor = encodeCursor({ createdAt: '2026-09-02T00:00:00.000Z', id: ADMIN.id });
    await app.request(`/users?cursor=${cursor}`);
    expect(queries[0]!.after).toEqual({
      createdAt: '2026-09-02T00:00:00.000Z',
      id: ADMIN.id,
    });
  });

  it('rejects a forged cursor and a limit out of range', async () => {
    const { app, queries } = setup();
    const forged = Buffer.from('{"createdAt":"x","id":"1 or 1=1"}').toString('base64url');
    expect((await app.request(`/users?cursor=${forged}`)).status).toBe(400);
    expect((await app.request('/users?cursor=not-base64-json')).status).toBe(400);
    expect((await app.request('/users?limit=5000')).status).toBe(400);
    expect(queries).toHaveLength(0);
  });

  describe('PATCH /users/:id', () => {
    const patch = (app: ReturnType<typeof setup>['app'], id: string, body: unknown) =>
      app.request(`/users/${id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });

    it('changes role and disabled state', async () => {
      const { app, changes } = setup();
      const response = await patch(app, OTHER, { role: 'teacher', disabled: true });
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ role: 'teacher', disabled: true });
      expect(changes).toEqual([
        { id: OTHER, change: { role: 'teacher', disabled: true } },
      ]);
    });

    it('refuses changing oneself, unknown fields, empty changes and unknown users', async () => {
      const { app, changes } = setup();
      expect((await patch(app, ADMIN.id, { role: 'student' })).status).toBe(400);
      expect((await patch(app, OTHER, { role: 'owner' })).status).toBe(400);
      expect((await patch(app, OTHER, { email: 'x@y.z' })).status).toBe(400);
      expect((await patch(app, OTHER, {})).status).toBe(400);
      expect((await patch(app, 'not-a-uuid', { role: 'teacher' })).status).toBe(404);
      expect(changes).toHaveLength(0);
      const unknown = '77777777-7777-4777-8777-777777777777';
      expect((await patch(app, unknown, { role: 'teacher' })).status).toBe(404);
    });
  });
});
