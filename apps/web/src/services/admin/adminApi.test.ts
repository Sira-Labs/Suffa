import { describe, expect, it, vi } from 'vitest';
import { AdminApi, describeAudit, type AuditEntry } from './adminApi';

function api(handler: (path: string, init?: RequestInit) => Response) {
  const calls: { path: string; init?: RequestInit }[] = [];
  const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ path: String(input), init });
    return handler(String(input), init);
  }) as unknown as typeof fetch;
  return { client: new AdminApi(fetchImpl), calls };
}

describe('AdminApi', () => {
  it('turns API errors into German messages', async () => {
    const { client } = api(() =>
      Response.json({ error: 'second_factor_required' }, { status: 403 })
    );
    expect(await client.listUsers({})).toEqual({
      ok: false,
      status: 403,
      code: 'second_factor_required',
      message: 'Bitte bestätige zuerst den Code aus deiner Authenticator-App.',
    });
  });

  it('sends search, cursor and changes', async () => {
    const { client, calls } = api(() => Response.json({ users: [], next: null }));
    await client.listUsers({ search: 'amina', cursor: 'abc' });
    expect(calls[0]!.path).toBe('/api/v1/admin/users?q=amina&cursor=abc');
    await client.updateUser('u/1', { disabled: true });
    expect(calls[1]!.path).toBe('/api/v1/admin/users/u%2F1');
    expect(calls[1]!.init).toMatchObject({ method: 'PATCH', credentials: 'same-origin' });
    expect(JSON.parse(String(calls[1]!.init!.body))).toEqual({ disabled: true });
  });

  it('accepts 204 without a body', async () => {
    const { client } = api(() => new Response(null, { status: 204 }));
    expect(await client.twoFactorConfirm('123456')).toEqual({
      ok: true,
      value: undefined,
    });
  });
});

describe('describeAudit', () => {
  const entry = (action: string, details: Record<string, unknown>): AuditEntry => ({
    id: '1',
    actorId: 'a',
    actorEmail: 'chef@example.org',
    action,
    targetType: 'user',
    targetId: 'u',
    details,
    createdAt: '2026-09-24T12:00:00.000Z',
  });

  it('says what happened in German', () => {
    expect(
      describeAudit(entry('user.role_changed', { from: 'student', to: 'teacher' }))
    ).toBe('Rolle geändert: Lernende:r → Lehrkraft');
    expect(describeAudit(entry('user.disabled', { endedSessions: 2 }))).toBe(
      'Konto gesperrt (2 Sitzung(en) beendet)'
    );
    expect(describeAudit(entry('something.new', {}))).toBe('something.new');
  });
});
