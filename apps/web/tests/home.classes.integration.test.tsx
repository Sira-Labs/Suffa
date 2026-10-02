/**
 * "Heute" shows the class (tester feedback R6): learners see their class at the top, with
 * what is open; waiting for approval or without a class they are told how it goes on;
 * teachers see their classes with this week's numbers.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { HomeClassCard } from '@/modules/classes/HomeClassCard';
import { pickAssignment, TeacherHome } from '@/modules/classes/TeacherHome';
import type { Assignment } from '@/services/media/interactiveApi';
import { ApiSyncProvider } from '@/services/sync/ApiSyncProvider';
import { db } from '@/services/storage';
import { useListenStore, useSyncStore } from '@/state';

const CLASS_ID = '11111111-1111-4111-8111-111111111111';
const REC = '33333333-3333-4333-8333-333333333333';
const OLD_REC = '44444444-4444-4444-8444-444444444444';
const TOKEN = 'abcdefghijklmnopqrstuvwxyz012345';

interface Setup {
  role: 'learner' | 'teacher';
  classes: Record<string, unknown>[];
}

function summary(over: Record<string, unknown>) {
  return {
    id: CLASS_ID,
    name: 'Medina 1 · Dienstag',
    course: 'madinah',
    classRole: 'student',
    status: 'active',
    studentCount: 0,
    pendingCount: 0,
    teacherName: 'Ustadh Karim',
    createdAt: '2026-09-01T00:00:00.000Z',
    ...over,
  };
}

const inTwoDays = new Date(Date.now() + 2 * 86_400_000).toISOString();

async function signIn({ role, classes }: Setup) {
  const api = vi.fn(async (input: RequestInfo | URL) => {
    const path = String(input);
    if (path === '/api/v1/me') {
      return Response.json({
        id: 'me',
        email: 'me@example.org',
        name: null,
        role,
        timeZone: 'Europe/Berlin',
      });
    }
    if (path === '/api/v1/classes') return Response.json({ classes });
    if (path.endsWith('/feed')) {
      return Response.json({
        challenge: {
          id: 'c1',
          template: 'reviews',
          target: 200,
          weekStart: '2026-09-28',
          progress: 128,
          reached: false,
          contributors: 5,
          yours: 20,
        },
        shoutouts: [
          {
            id: 's1',
            message: 'Sehr gute Aussprache!',
            author: 'Ustadh Karim',
            to: 'Ich',
            toYou: true,
            createdAt: '2026-10-01T10:00:00.000Z',
          },
        ],
        badges: [],
      });
    }
    if (path.endsWith('/assignments')) {
      return Response.json({
        assignments: [
          {
            id: 'a1',
            kind: 'unit',
            ref: '107',
            title: 'Lektionstest Lektion 7',
            dueAt: inTwoDays,
            done: role === 'learner' ? false : null,
            doneCount: role === 'teacher' ? 8 : null,
            learners: role === 'teacher' ? 14 : null,
          },
        ],
      });
    }
    if (path.endsWith('/media')) {
      const item = {
        title: 'Unterricht vom Dienstag',
        source: 'upload',
        status: 'ready',
        progress: 100,
        durationSec: 2520,
        hasVideo: false,
        originalName: 'x.m4a',
        originalSize: 1,
        error: null,
        publishedAt: '2026-09-30T10:00:00.000Z',
        createdAt: '2026-09-30T09:00:00.000Z',
      };
      return Response.json({
        items: [
          { ...item, id: REC },
          { ...item, id: OLD_REC, title: 'Stunde 1' },
        ],
      });
    }
    if (path.endsWith('/progress')) {
      const now = new Date().toISOString();
      const long = '2026-01-01T00:00:00.000Z';
      return Response.json({
        since: now,
        students: [now, now, long].map((lastActiveAt, i) => ({
          userId: `u${i}`,
          name: `L${i}`,
          email: null,
          lastActiveAt,
          streak: 0,
          totalXp: 0,
          xpWeek: 0,
          questsWeek: 0,
          activeDaysWeek: 0,
          matureWords: 0,
          currentUnit: null,
        })),
        matureByRef: {},
        leeches: [],
      });
    }
    if (path.endsWith('/listening')) {
      return Response.json({
        recordings: [
          {
            mediaId: REC,
            title: 'Unterricht vom Dienstag',
            publishedAt: '2026-09-30T10:00:00.000Z',
            learners: 3,
            started: 1,
            finished: 1,
            people: [],
          },
        ],
      });
    }
    return new Response(null, { status: 404 });
  }) as unknown as typeof fetch;
  vi.stubGlobal('fetch', api);
  const provider = new ApiSyncProvider('', api);
  await provider.refresh();
  useSyncStore.setState({ provider, auth: provider.getAuthState() });
}

function renderAt(element: React.ReactElement) {
  const router = createMemoryRouter(
    [
      { path: '/', element },
      { path: '/join/:token', element: <h1>Einladung</h1> },
    ],
    { initialEntries: ['/'] }
  );
  render(<RouterProvider router={router} />);
  return router;
}

describe('Classes on "Heute" (integration)', () => {
  const original = useSyncStore.getState();
  beforeEach(async () => {
    await db.media_progress.clear();
    await useListenStore.getState().load();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    useSyncStore.setState({ provider: original.provider, auth: original.auth });
  });

  it('shows the learner their class with what is open', async () => {
    // The older recording was heard already.
    await db.media_progress.put({
      id: `rec/${OLD_REC}`,
      ref: `recording:${OLD_REC}`,
      lessonKey: `rec/${CLASS_ID}`,
      durationSec: 100,
      listenedSec: 100,
      completedAt: '2026-10-01T10:00:00.000Z',
      updatedAt: '2026-10-01T10:00:00.000Z',
    } as never);
    await useListenStore.getState().load();
    await signIn({ role: 'learner', classes: [summary({})] });
    renderAt(<HomeClassCard />);

    const card = await screen.findByRole('region', { name: 'Medina 1 · Dienstag' });
    expect(within(card).getByText('bei Ustadh Karim')).toBeTruthy();
    const tiles = within(card).getByRole('list', { name: 'Neues aus der Klasse' });
    await within(tiles).findByText('64 %');
    expect(tiles.textContent).toContain('1Aufgabe offen');
    expect(tiles.textContent).toContain('1neue Aufnahme');

    const next = within(card).getByRole('list', { name: 'Als Nächstes in der Klasse' });
    expect(
      within(next).getByRole('link', { name: /Lektionstest Lektion 7/ })
    ).toHaveAttribute('href', '/units/madinah/7');
    expect(
      within(next).getByRole('link', {
        name: /Unterricht vom Dienstag.*noch nicht gehört/,
      })
    ).toHaveAttribute('href', `/classes/${CLASS_ID}/recordings/${REC}`);
    expect(within(next).queryByText('Stunde 1')).toBeNull();
    expect(within(card).getByText('Sehr gute Aussprache!')).toBeTruthy();
    expect(
      within(card).getByRole('link', { name: 'Zur Klasse Medina 1 · Dienstag' })
    ).toHaveAttribute('href', `/classes/${CLASS_ID}`);
  });

  it('tells a learner who waits for approval', async () => {
    await signIn({ role: 'learner', classes: [summary({ status: 'pending' })] });
    renderAt(<HomeClassCard />);
    expect(
      await screen.findByText(/Wartet auf Freigabe durch Ustadh Karim/)
    ).toBeTruthy();
  });

  it('lets a learner without a class join with the invite link', async () => {
    await signIn({ role: 'learner', classes: [] });
    const router = renderAt(<HomeClassCard />);
    const field = await screen.findByLabelText('Einladungslink');
    await userEvent.type(field, 'Hallo');
    await userEvent.click(screen.getByRole('button', { name: 'Beitreten' }));
    expect(screen.getByText(/kein Einladungslink/)).toBeTruthy();
    await userEvent.clear(field);
    await userEvent.type(field, `https://suffa.example/join/${TOKEN}`);
    await userEvent.click(screen.getByRole('button', { name: 'Beitreten' }));
    expect(await screen.findByRole('heading', { name: 'Einladung' })).toBeTruthy();
    expect(router.state.location.pathname).toBe(`/join/${TOKEN}`);
  });

  it('shows nothing without an account', () => {
    renderAt(<HomeClassCard />);
    expect(screen.queryByText('Deine Klasse')).toBeNull();
  });

  it('shows teachers their classes with this week’s numbers', async () => {
    await signIn({
      role: 'teacher',
      classes: [summary({ classRole: 'teacher', studentCount: 3, pendingCount: 2 })],
    });
    renderAt(<TeacherHome />);

    expect(
      await screen.findByRole('link', { name: /2 Personen warten auf Freigabe/ })
    ).toHaveAttribute('href', `/classes/${CLASS_ID}?tab=members`);
    const card = screen.getByRole('region', { name: 'Medina 1 · Dienstag' });
    expect(within(card).getByText('3 Lernende · 2 warten')).toBeTruthy();
    const tiles = within(card).getByRole('list', { name: /Diese Woche/ });
    await within(tiles).findByText('2/3');
    expect(tiles.textContent).toContain('2/3aktiv diese Woche');
    expect(tiles.textContent).toContain('8/14Aufgabe erledigt');
    expect(tiles.textContent).toContain('1/3letzte Aufnahme gehört');
    expect(
      within(card).getByRole('progressbar', { name: 'Unterricht vom Dienstag: gehört' })
    ).toHaveAttribute('aria-valuenow', '1');
    expect(
      within(card).getByRole('link', { name: 'Aufnahme hochladen' })
    ).toHaveAttribute('href', `/classes/${CLASS_ID}?tab=recordings`);
    expect(screen.getByRole('link', { name: /Selbst lernen/ })).toHaveAttribute(
      'href',
      '/units'
    );
  });

  it('picks the assignment due next, else the one that ended last', () => {
    const a = (id: string, dueAt: string) => ({ id, dueAt }) as Assignment;
    const now = Date.parse('2026-10-02T12:00:00Z');
    const items = [
      a('old', '2026-09-20T00:00:00Z'),
      a('later', '2026-10-09T00:00:00Z'),
      a('soon', '2026-10-03T00:00:00Z'),
    ];
    expect(pickAssignment(items, now)?.id).toBe('soon');
    expect(pickAssignment([items[0]!], now)?.id).toBe('old');
    expect(pickAssignment([], now)).toBeNull();
  });
});
