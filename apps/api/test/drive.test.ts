import { describe, expect, it, vi } from 'vitest';
import { GoogleError, HttpGoogleClient, DRIVE_SCOPE } from '../src/drive/google.js';
import { readState, signState } from '../src/drive/state.js';

const SECRET = 'x'.repeat(40);

describe('OAuth state', () => {
  it('binds the round trip to the teacher, expires, and resists tampering', () => {
    const now = Date.parse('2026-09-25T10:00:00Z');
    const state = signState(SECRET, 'teacher-1', '/classes/abc', now);
    expect(readState(SECRET, state, now)).toEqual({
      userId: 'teacher-1',
      returnTo: '/classes/abc',
    });
    expect(readState(SECRET, state, now + 11 * 60_000)).toBeNull();
    expect(readState('y'.repeat(40), state, now)).toBeNull();
    const [payload] = state.split('.');
    expect(readState(SECRET, `${payload}.AAAA`, now)).toBeNull();
    expect(readState(SECRET, 'garbage', now)).toBeNull();
    // Only in-app return paths.
    const evil = signState(SECRET, 'teacher-1', '//evil.example', now);
    expect(readState(SECRET, evil, now)?.returnTo).toBe('/classes');
  });
});

describe('HttpGoogleClient', () => {
  const settings = {
    clientId: 'id.apps.googleusercontent.com',
    clientSecret: 'secret',
    redirectUri: 'https://suffa.example.org/api/v1/drive/callback',
  };

  it('asks for drive.file only, offline, with the state', () => {
    const url = new URL(new HttpGoogleClient(settings).authUrl('st'));
    expect(url.searchParams.get('scope')).toBe(DRIVE_SCOPE);
    expect(url.searchParams.get('access_type')).toBe('offline');
    expect(url.searchParams.get('state')).toBe('st');
    expect(url.searchParams.get('redirect_uri')).toBe(settings.redirectUri);
  });

  it('exchanges codes, refreshes tokens and reads files', async () => {
    const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.startsWith('https://oauth2.googleapis.com/token')) {
        const body = new URLSearchParams(String(init?.body));
        if (body.get('grant_type') === 'authorization_code') {
          return Response.json({ access_token: 'a1', refresh_token: 'r1' });
        }
        return body.get('refresh_token') === 'r1'
          ? Response.json({ access_token: 'a2' })
          : Response.json({ error: 'invalid_grant' }, { status: 400 });
      }
      if (url.endsWith('alt=media')) return new Response('bytes');
      if (url.includes('/files/f1')) {
        return Response.json({
          id: 'f1',
          name: 'Stunde.mp4',
          mimeType: 'video/mp4',
          size: '42',
        });
      }
      return new Response(null, { status: 404 });
    }) as unknown as typeof fetch;
    const client = new HttpGoogleClient(settings, fetchImpl);
    expect(await client.exchangeCode('code')).toEqual({
      refreshToken: 'r1',
      accessToken: 'a1',
    });
    expect(await client.accessToken('r1')).toBe('a2');
    await expect(client.accessToken('revoked')).rejects.toBeInstanceOf(GoogleError);
    expect(await client.file('a2', 'f1')).toEqual({
      id: 'f1',
      name: 'Stunde.mp4',
      mimeType: 'video/mp4',
      size: 42,
    });
    await expect(client.file('a2', 'missing')).rejects.toBeInstanceOf(GoogleError);
    expect(await (await client.download('a2', 'f1')).text()).toBe('bytes');
  });
});
