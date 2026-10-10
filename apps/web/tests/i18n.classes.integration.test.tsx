/**
 * Story 16.3: the classes area in English. The class list, a teacher's class page with its
 * tabs and a learner's class feed follow the interface language, also when it changes while
 * the page is open. Class names, member names and shout-outs stay as they were written.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, MemoryRouter, RouterProvider } from 'react-router-dom';
import { setUiLanguage } from '@/i18n';
import { Classes } from '@/modules/classes';
import { ClassPage } from '@/modules/classes/ClassPage';
import { ApiSyncProvider } from '@/services/sync/ApiSyncProvider';
import { useSyncStore } from '@/state';

const CLASS_ID = '11111111-1111-4111-8111-111111111111';
const AMINA = '22222222-2222-4222-8222-222222222222';

const feed = {
  challenge: {
    id: 'c1',
    template: 'reviews',
    target: 100,
    weekStart: '2026-09-21',
    progress: 40,
    reached: false,
    contributors: 2,
    yours: 15,
  },
  shoutouts: [
    {
      id: 's1',
      message: 'Masha’Allah, Amina!',
      author: 'Frau Yilmaz',
      to: 'Amina',
      toYou: true,
      createdAt: '2026-09-22T10:00:00.000Z',
    },
  ],
  badges: [],
};

/** A signed-in provider and a fake API answering the class routes. */
async function signIn(role: 'teacher' | 'student') {
  const api = vi.fn(async (input: RequestInfo | URL) => {
    const path = String(input);
    if (path === '/api/v1/me') {
      return Response.json({
        id: 'me',
        email: 'me@example.org',
        name: null,
        role,
        timeZone: 'Europe/Zurich',
      });
    }
    if (path === '/api/v1/classes') {
      return Response.json({
        classes: [
          {
            id: CLASS_ID,
            name: 'Arabisch 1a',
            course: 'bayna-yadayk',
            classRole: role,
            status: 'active',
            studentCount: 1,
            pendingCount: 2,
            createdAt: '2026-09-01T00:00:00.000Z',
          },
        ],
      });
    }
    if (path.endsWith('/progress')) {
      return Response.json({
        since: '2026-09-17T00:00:00.000Z',
        students: [
          {
            userId: AMINA,
            name: 'Amina',
            email: 'amina@example.org',
            lastActiveAt: new Date().toISOString(),
            streak: 4,
            totalXp: 420,
            xpWeek: 180,
            questsWeek: 9,
            activeDaysWeek: 4,
            matureWords: 12,
            currentUnit: 3,
          },
        ],
        matureByRef: {},
        leeches: [],
      });
    }
    if (path.endsWith('/feed')) return Response.json(feed);
    if (path.endsWith('/media')) return Response.json({ items: [] });
    if (path.endsWith('/assignments')) return Response.json({ assignments: [] });
    if (path.endsWith('/settings')) return Response.json({ aiEnabled: true });
    if (path.endsWith('/members')) {
      return Response.json({
        members: [
          {
            userId: AMINA,
            email: 'amina@example.org',
            name: 'Amina',
            classRole: 'student',
            status: 'active',
            joinedAt: '2026-09-02T00:00:00.000Z',
          },
        ],
      });
    }
    if (path.endsWith('/shared-recordings')) {
      return Response.json({ targets: [], items: [] });
    }
    if (path.endsWith('/speech')) return Response.json({ serverSpeech: true });
    return new Response(null, { status: 204 });
  }) as unknown as typeof fetch;
  vi.stubGlobal('fetch', api);
  const provider = new ApiSyncProvider('', api);
  await provider.refresh();
  useSyncStore.setState({ provider, auth: provider.getAuthState() });
}

function renderClass() {
  const router = createMemoryRouter(
    [
      { path: '/classes/:id', element: <ClassPage /> },
      { path: '/classes', element: <Classes /> },
    ],
    { initialEntries: [`/classes/${CLASS_ID}`] }
  );
  return render(<RouterProvider router={router} />);
}

describe('classes in English (integration)', () => {
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

  it('shows a teacher the class list in English', async () => {
    await signIn('teacher');
    render(
      <MemoryRouter>
        <Classes />
      </MemoryRouter>
    );
    expect(screen.getByRole('heading', { name: 'Classes' })).toBeInTheDocument();
    expect(
      screen.getByRole('textbox', { name: 'Name of the new class' })
    ).toHaveAttribute('placeholder', 'Name of the new class, e.g. Arabic 1a');
    expect(screen.getByRole('button', { name: 'Create' })).toBeInTheDocument();
    const link = await screen.findByRole('link', { name: /Arabisch 1a/ });
    expect(link).toHaveTextContent('1 learner · 2 waiting');
  });

  it('shows a teacher the class page with its tabs in English', async () => {
    await signIn('teacher');
    renderClass();
    const table = await screen.findByRole('table');
    expect(within(table).getByRole('columnheader', { name: 'Last active' })).toBeTruthy();
    expect(within(table).getByRole('row', { name: /Amina/ })).toHaveTextContent('today');
    expect(
      screen.getByText(/1 of 1 learners were active in the last 3 days/)
    ).toBeTruthy();
    expect(screen.getByRole('tablist', { name: 'Class sections' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('tab', { name: 'Class life' }));
    expect(await screen.findByText('Together 100 cards: Review cards')).toBeTruthy();
    expect(screen.getByText(/40 of 100 · 2 have taken part/)).toBeTruthy();
    const form = screen.getByRole('form', { name: 'Set the challenge' });
    expect(within(form).getByLabelText('Target')).toBeInTheDocument();
    expect(within(form).getByRole('button', { name: 'Save' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Class tasks' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Teacher’s badges' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('tab', { name: 'Members' }));
    expect(
      await screen.findByRole('button', { name: 'Invite link & QR code' })
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete class …' })).toBeInTheDocument();
    expect(
      await screen.findByRole('checkbox', { name: /Rate recordings on the server/ })
    ).toBeChecked();
  });

  it('shows a learner the class feed in English and follows a language change', async () => {
    await signIn('student');
    renderClass();
    expect(await screen.findByText(/your share: 15/)).toBeInTheDocument();
    expect(screen.getByText('This week’s class challenge')).toBeInTheDocument();
    // What the teacher wrote stays as it is.
    expect(screen.getByText('Masha’Allah, Amina!')).toBeInTheDocument();
    expect(screen.getByText(/Frau Yilmaz → you/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Recordings' })).toBeInTheDocument();

    await act(() => setUiLanguage('de'));
    expect(await screen.findByText(/dein Beitrag: 15/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Aufnahmen' })).toBeInTheDocument();
  });
});
