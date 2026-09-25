import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
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
async function signIn(role: 'teacher' | 'student', classRole: 'teacher' | 'student') {
  const requests: { method: string; path: string; body: unknown }[] = [];
  const api = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input);
    const method = init?.method ?? 'GET';
    requests.push({
      method,
      path,
      body: init?.body ? JSON.parse(String(init.body)) : null,
    });
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
            classRole,
            status: 'active',
            studentCount: 1,
            pendingCount: 0,
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
    if (method === 'PUT') return Response.json({ ...feed.challenge, target: 200 });
    return new Response(null, { status: 204 });
  }) as unknown as typeof fetch;
  vi.stubGlobal('fetch', api);
  const provider = new ApiSyncProvider('', api);
  await provider.refresh();
  useSyncStore.setState({ provider, auth: provider.getAuthState() });
  return requests;
}

function renderClass() {
  const router = createMemoryRouter([{ path: '/classes/:id', element: <ClassPage /> }], {
    initialEntries: [`/classes/${CLASS_ID}`],
  });
  return render(<RouterProvider router={router} />);
}

/** Sprint 6: a teacher's class page and a learner's class feed. */
describe('Class page (integration)', () => {
  const original = useSyncStore.getState();
  beforeEach(() => vi.unstubAllGlobals());
  afterEach(() => {
    vi.unstubAllGlobals();
    useSyncStore.setState({ provider: original.provider, auth: original.auth });
  });

  it('shows the teacher the progress table and lets them set the challenge', async () => {
    const requests = await signIn('teacher', 'teacher');
    renderClass();
    const table = await screen.findByRole('table');
    const row = within(table).getByRole('row', { name: /Amina/ });
    expect(row.textContent).toContain('heute');
    expect(row.textContent).toContain('4/7');

    await userEvent.click(screen.getByRole('tab', { name: 'Klassenleben' }));
    expect(await screen.findByText(/Gemeinsam 100 Karten/)).toBeInTheDocument();
    const form = screen.getByRole('form', { name: 'Challenge festlegen' });
    const target = within(form).getByLabelText('Ziel');
    await userEvent.clear(target);
    await userEvent.type(target, '200');
    await userEvent.click(within(form).getByRole('button', { name: 'Speichern' }));
    const put = requests.find((r) => r.method === 'PUT');
    expect(put).toMatchObject({
      path: `/api/v1/classes/${CLASS_ID}/challenge`,
      body: { template: 'reviews', target: 200, timeZone: 'Europe/Zurich' },
    });

    await userEvent.click(screen.getByRole('tab', { name: 'Mitglieder' }));
    expect(await screen.findByText(/Einladungslink/)).toBeInTheDocument();
  });

  it('shows a learner the challenge with their share and shout-outs to them', async () => {
    await signIn('student', 'student');
    renderClass();
    expect(await screen.findByText(/dein Beitrag: 15/)).toBeInTheDocument();
    expect(screen.getByText('Masha’Allah, Amina!')).toBeInTheDocument();
    expect(screen.queryByRole('tab')).toBeNull();
    expect(screen.queryByRole('form', { name: 'Challenge festlegen' })).toBeNull();
  });
});
