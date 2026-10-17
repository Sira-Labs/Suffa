/**
 * Invite links to a live session: the teacher shows a link with its QR code; opening it, a
 * member goes to the session and someone new asks to join the class first.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { LiveInvite } from '@/modules/live/LiveInvite';
import { LiveSessionsTeacher } from '@/modules/live/LiveSessions';
import type { LiveSession } from '@/services/live/liveApi';
import { ApiSyncProvider } from '@/services/sync/ApiSyncProvider';
import { useSyncStore } from '@/state';

const CLASS_ID = '11111111-1111-4111-8111-111111111111';
const SESSION_ID = '22222222-2222-4222-8222-222222222222';
const TOKEN = 'abcdefghijklmnopqrstuvwxyz012345';

const session: LiveSession = {
  id: SESSION_ID,
  classId: CLASS_ID,
  title: 'Lektion 5',
  startsAt: '2026-10-20T16:00:00.000Z',
  durationMinutes: 60,
  status: 'scheduled',
  startedAt: null,
  endedAt: null,
  audience: 'all',
  learnerCameras: true,
  recording: false,
};

function fakeApi(join: { status: 'pending' | 'active' }[] = [{ status: 'active' }]) {
  const requests: string[] = [];
  const api = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input);
    const method = init?.method ?? 'GET';
    requests.push(`${method} ${path}`);
    if (path === '/api/v1/me') {
      return Response.json({ id: 'me', email: 'me@example.org', name: null });
    }
    if (path === `/api/v1/classes/${CLASS_ID}/live`) {
      return Response.json({
        enabled: true,
        recordingEnabled: false,
        sessions: [session],
      });
    }
    if (path === `/api/v1/classes/${CLASS_ID}/live/${SESSION_ID}/invite`) {
      return Response.json(
        {
          url: `https://suffa.example.org/live-invite/${TOKEN}`,
          expiresAt: '2026-10-21T05:00:00.000Z',
        },
        { status: 201 }
      );
    }
    if (path === `/api/v1/live-invites/${TOKEN}`) {
      return Response.json({
        classId: CLASS_ID,
        className: 'Arabisch 1a',
        teacherName: 'Ustadha Maryam',
        sessionId: SESSION_ID,
        title: 'Lektion 5',
        startsAt: session.startsAt,
        status: 'scheduled',
      });
    }
    if (path === `/api/v1/live-invites/${TOKEN}/join`) {
      const next = join.shift() ?? { status: 'active' };
      return Response.json({ classId: CLASS_ID, sessionId: SESSION_ID, ...next });
    }
    return Response.json({ error: 'invalid_invite' }, { status: 404 });
  }) as unknown as typeof fetch;
  vi.stubGlobal('fetch', api);
  return { api, requests };
}

const original = useSyncStore.getState();

async function signIn(api: typeof fetch) {
  const provider = new ApiSyncProvider('', api);
  await provider.refresh();
  useSyncStore.setState({ provider, auth: provider.getAuthState() });
}

function openInvite(token = TOKEN) {
  const router = createMemoryRouter(
    [
      { path: '/live-invite/:token', element: <LiveInvite /> },
      { path: '/classes/:id/live/:session', element: <h1>Live-Raum</h1> },
    ],
    { initialEntries: [`/live-invite/${token}`] }
  );
  render(<RouterProvider router={router} />);
  return router;
}

beforeEach(() => vi.unstubAllGlobals());
afterEach(() => {
  vi.unstubAllGlobals();
  useSyncStore.setState({ provider: original.provider, auth: original.auth });
});

describe('inviting to a live session', () => {
  it('shows the teacher a link with its QR code to copy, and hides it again', async () => {
    const { requests } = fakeApi();
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });
    const router = createMemoryRouter(
      [{ path: '/', element: <LiveSessionsTeacher classId={CLASS_ID} /> }],
      { initialEntries: ['/'] }
    );
    render(<RouterProvider router={router} />);
    const item = (await screen.findByText('Lektion 5')).closest('li') as HTMLElement;
    await userEvent.click(within(item).getByRole('button', { name: 'Einladen' }));

    const qr = await within(item).findByAltText(
      'QR-Code zum Live-Unterricht „Lektion 5“'
    );
    expect(qr.getAttribute('src')).toMatch(/^data:image\/png;base64,/);
    expect(
      within(item).getByText(`https://suffa.example.org/live-invite/${TOKEN}`)
    ).toBeTruthy();
    expect(
      within(item).getByText(/Gilt bis .*nur für diesen Live-Unterricht/)
    ).toBeTruthy();
    expect(within(item).getByText(/du gibst ihn unter Mitglieder frei/)).toBeTruthy();
    expect(requests).toContain(
      `POST /api/v1/classes/${CLASS_ID}/live/${SESSION_ID}/invite`
    );

    await userEvent.click(within(item).getByRole('button', { name: 'Link kopieren' }));
    expect(writeText).toHaveBeenCalledWith(
      `https://suffa.example.org/live-invite/${TOKEN}`
    );
    expect(within(item).getByRole('button', { name: 'Kopiert' })).toBeTruthy();

    await userEvent.click(
      within(item).getByRole('button', { name: 'Einladung ausblenden' })
    );
    expect(within(item).queryByRole('img')).toBeNull();
  });

  it('takes a member of the class from the link to the session', async () => {
    const { api } = fakeApi([{ status: 'active' }]);
    await signIn(api);
    const router = openInvite();
    expect(await screen.findByText('Lektion 5')).toBeTruthy();
    expect(screen.getByText(/Ustadha Maryam lädt dich zum Live-Unterricht/)).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Teilnehmen' }));
    expect(await screen.findByRole('heading', { name: 'Live-Raum' })).toBeTruthy();
    expect(router.state.location.pathname).toBe(
      `/classes/${CLASS_ID}/live/${SESSION_ID}`
    );
  });

  it('lets someone new ask to join the class and come in once approved', async () => {
    const { api } = fakeApi([{ status: 'pending' }, { status: 'active' }]);
    await signIn(api);
    const router = openInvite();
    await userEvent.click(await screen.findByRole('button', { name: 'Teilnehmen' }));
    expect(
      await screen.findByText(
        /Deine Anfrage zur Klasse Arabisch 1a ist bei der Lehrkraft/
      )
    ).toBeTruthy();
    // Approved in the meantime: the same link now leads in.
    await userEvent.click(screen.getByRole('button', { name: 'Noch einmal versuchen' }));
    expect(await screen.findByRole('heading', { name: 'Live-Raum' })).toBeTruthy();
    expect(router.state.location.pathname).toBe(
      `/classes/${CLASS_ID}/live/${SESSION_ID}`
    );
  });

  it('says when a link no longer works', async () => {
    const { api } = fakeApi();
    await signIn(api);
    openInvite('expiredexpiredexpiredexpired00');
    expect(
      await screen.findByText(
        'Dieser Einladungslink gilt nicht mehr. Bitte die Lehrkraft um einen neuen.'
      )
    ).toBeTruthy();
  });
});
