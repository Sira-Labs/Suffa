import { describe, expect, it, vi } from 'vitest';
import { ClassesApi, inviteToken } from './classesApi';

describe('ClassesApi', () => {
  it('joins with a token and explains a stale invite', async () => {
    const calls: string[] = [];
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push(`${init?.method ?? 'GET'} ${String(input)}`);
      return Response.json({ error: 'invalid_invite' }, { status: 404 });
    }) as unknown as typeof fetch;
    const result = await new ClassesApi(fetchImpl).join(
      'abcdefghijklmnopqrstuvwxyz012345'
    );
    expect(calls).toEqual(['POST /api/v1/invites/abcdefghijklmnopqrstuvwxyz012345/join']);
    expect(result).toMatchObject({ ok: false, code: 'invalid_invite' });
    expect(!result.ok && result.message).toMatch(/abgelaufen oder ungültig/);
  });

  it('reads the token from an invite link', () => {
    expect(
      inviteToken('https://suffa.example.org/join/abcdefghijklmnopqrstuvwxyz012345')
    ).toBe('abcdefghijklmnopqrstuvwxyz012345');
    expect(inviteToken('https://suffa.example.org/settings')).toBeNull();
  });
});
