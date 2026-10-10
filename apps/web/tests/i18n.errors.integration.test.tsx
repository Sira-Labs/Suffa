/**
 * Story 16.3: error messages from the API and the services follow the interface language.
 * The text is resolved when the error is created, so a page shows `message` as it is; German
 * stays as before.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { setUiLanguage } from '@/i18n';
import { de } from '@/i18n/locales/de';
import { en } from '@/i18n/locales/en';
import { Join } from '@/modules/classes/Join';
import { apiRequest } from '@/services/api/request';
import { ClassesApi } from '@/services/classes/classesApi';
import { passkeyMessage } from '@/services/passkeys';
import { ApiSyncProvider } from '@/services/sync/ApiSyncProvider';
import { TutorApi } from '@/services/tutor/tutorApi';
import { useSyncStore } from '@/state';

const refuse = (error: string, status = 400) =>
  vi.fn(async () => Response.json({ error }, { status })) as unknown as typeof fetch;

describe('API errors in English (integration)', () => {
  const original = useSyncStore.getState();

  beforeEach(async () => {
    vi.unstubAllGlobals();
    await act(() => setUiLanguage('en'));
  });

  afterEach(async () => {
    await act(() => setUiLanguage('de'));
    localStorage.clear();
    vi.unstubAllGlobals();
    useSyncStore.setState({ provider: original.provider, auth: original.auth });
  });

  it('resolves an area code, a shared code, an unknown code and no connection', async () => {
    const invite = await new ClassesApi(refuse('invalid_invite')).preview('t');
    expect(!invite.ok && invite.message).toBe(
      'This invite link has expired or is not valid. Please ask for a new one.'
    );
    const signedOut = await apiRequest(refuse('unauthorized', 401), '/x', {}, 'videos');
    expect(!signedOut.ok && signedOut.message).toBe('Please sign in.');
    const unknown = await apiRequest(refuse('boom', 500), '/x');
    expect(!unknown.ok && unknown.message).toBe('Server error (500).');
    const offline = await apiRequest(
      vi.fn(async () => {
        throw new TypeError('network');
      }) as unknown as typeof fetch,
      '/x'
    );
    expect(!offline.ok && offline.message).toBe('No connection.');
    // The area wins over the shared text for the same code.
    const forbidden = await new ClassesApi(refuse('forbidden', 403)).archive('c');
    expect(!forbidden.ok && forbidden.message).toBe(
      'Only the teacher of this class can do that.'
    );
  });

  it('keeps the German texts, resolved in the language of the moment', async () => {
    await act(() => setUiLanguage('de'));
    const invite = await new ClassesApi(refuse('invalid_invite')).preview('t');
    expect(!invite.ok && invite.message).toBe(
      'Dieser Einladungslink ist abgelaufen oder ungültig. Bitte frag nach einem neuen.'
    );
    const unknown = await apiRequest(refuse('boom', 502), '/x');
    expect(!unknown.ok && unknown.message).toBe('Serverfehler (502).');
  });

  it('explains a refused tutor turn and a passkey failure in English', async () => {
    const events = [];
    for await (const event of new TutorApi(refuse('ai_quota', 429)).turn({
      message: 'marhaban',
    })) {
      events.push(event);
    }
    expect(events).toEqual([
      {
        type: 'error',
        error: 'ai_quota',
        message:
          'You have used all of today’s conversations with al-Muʿallim. You can continue tomorrow.',
      },
    ]);
    expect(passkeyMessage('rate-limited')).toBe(
      'Too many attempts – please try again in a few minutes.'
    );
    expect(passkeyMessage('cancelled')).toBeUndefined();
  });

  it('shows an English error on the invite page', async () => {
    const api = vi.fn(async (input: RequestInfo | URL) => {
      const path = String(input);
      if (path === '/api/v1/me') {
        return Response.json({ id: 'me', email: 'me@example.org', name: null });
      }
      return Response.json({ error: 'invalid_invite' }, { status: 404 });
    }) as unknown as typeof fetch;
    vi.stubGlobal('fetch', api);
    const provider = new ApiSyncProvider('', api);
    await provider.refresh();
    useSyncStore.setState({ provider, auth: provider.getAuthState() });
    const router = createMemoryRouter([{ path: '/join/:token', element: <Join /> }], {
      initialEntries: ['/join/abc'],
    });
    render(<RouterProvider router={router} />);
    expect(
      await screen.findByText(
        'This invite link has expired or is not valid. Please ask for a new one.'
      )
    ).toBeInTheDocument();
  });

  it('has an English text for every error code', () => {
    for (const [area, texts] of Object.entries(de.errors)) {
      const english = en.errors[area as keyof typeof en.errors];
      expect(Object.keys(english).sort()).toEqual(Object.keys(texts).sort());
    }
  });
});
