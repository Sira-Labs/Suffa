import { describe, expect, it } from 'vitest';
import type { AdminRepository, UserQuery } from '../src/admin/repository.js';
import { createAdminRoutes, decodeCursor, encodeCursor } from '../src/admin/routes.js';

const ADMIN = { id: '44444444-4444-4444-8444-444444444444', role: 'admin' } as const;
const quiet = { warn: () => {} };

function setup() {
  const queries: UserQuery[] = [];
  const repo: AdminRepository = {
    listUsers: async (query) => {
      queries.push(query);
      return {
        users: [],
        next: { createdAt: '2026-09-01T10:00:00.000Z', id: ADMIN.id },
      };
    },
  };
  const app = createAdminRoutes({ repo, auth: { actor: async () => ADMIN }, log: quiet });
  return { app, queries };
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
});
