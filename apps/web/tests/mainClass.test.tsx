/**
 * A learner in several classes picks the main class on "Klassen": it shapes the app's course,
 * colours and unlocks, synced as a setting; joining another class does not change it.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { Classes } from '@/modules/classes/Classes';
import { ClassContextSync } from '@/modules/classes/ClassContextSync';
import { ApiSyncProvider } from '@/services/sync/ApiSyncProvider';
import { db } from '@/services/storage';
import { useClassContextStore, useSettingsStore, useSyncStore } from '@/state';

const FIRST = '11111111-1111-4111-8111-111111111111';
const SECOND = '22222222-2222-4222-8222-222222222222';

const summary = (id: string, name: string, course: string, joinedAt: string) => ({
  id,
  name,
  course,
  palette: course === 'madinah' ? 'meer' : 'oase',
  classRole: 'student',
  status: 'active',
  studentCount: 0,
  pendingCount: 0,
  createdAt: '2026-09-01T00:00:00.000Z',
  joinedAt,
});

const original = useSyncStore.getState();

beforeEach(async () => {
  await db.settings.clear();
  await useSettingsStore.getState().load();
  useClassContextStore.setState({ context: null });
  const api = vi.fn(async (input: RequestInfo | URL) => {
    const path = String(input);
    if (path === '/api/v1/me') {
      return Response.json({
        id: 'me',
        email: 'me@example.org',
        name: null,
        role: 'student',
      });
    }
    if (path === '/api/v1/classes') {
      return Response.json({
        classes: [
          summary(
            FIRST,
            'Bayna Yadayk · Samstag',
            'bayna-yadayk',
            '2026-09-05T00:00:00.000Z'
          ),
          summary(SECOND, 'Medina 1 · Dienstag', 'madinah', '2026-10-10T00:00:00.000Z'),
        ],
      });
    }
    return new Response(null, { status: 204 });
  }) as unknown as typeof fetch;
  vi.stubGlobal('fetch', api);
  const provider = new ApiSyncProvider('', api);
  await provider.refresh();
  useSyncStore.setState({ provider, auth: provider.getAuthState() });
});

afterEach(() => {
  vi.unstubAllGlobals();
  useSyncStore.setState({ provider: original.provider, auth: original.auth });
  useClassContextStore.setState({ context: null });
});

describe('main class', () => {
  it('starts with the class joined first and lets the learner choose another', async () => {
    const router = createMemoryRouter(
      [
        {
          path: '/classes',
          element: (
            <>
              <ClassContextSync />
              <Classes />
            </>
          ),
        },
      ],
      { initialEntries: ['/classes'] }
    );
    render(<RouterProvider router={router} />);
    expect(await screen.findByText(/Die Hauptklasse bestimmt Kurs, Farben/)).toBeTruthy();
    // Joined first, so the app follows it although Medina came later.
    await waitFor(() =>
      expect(useClassContextStore.getState().context?.classId).toBe(FIRST)
    );
    const first = screen
      .getByText('Bayna Yadayk · Samstag')
      .closest('.class-row') as HTMLElement;
    expect(within(first).getByText('Hauptklasse')).toBeTruthy();

    await userEvent.click(
      screen.getByRole('button', { name: 'Medina 1 · Dienstag als Hauptklasse wählen' })
    );
    expect(useSettingsStore.getState().settings.mainClassId).toBe(SECOND);
    await waitFor(() =>
      expect(useClassContextStore.getState().context).toMatchObject({
        classId: SECOND,
        course: 'madinah',
        palette: 'meer',
      })
    );
    const second = screen
      .getByText('Medina 1 · Dienstag')
      .closest('.class-row') as HTMLElement;
    expect(within(second).getByText('Hauptklasse')).toBeTruthy();
    expect(
      screen.getByRole('button', {
        name: 'Bayna Yadayk · Samstag als Hauptklasse wählen',
      })
    ).toBeTruthy();
    // Saved as a setting, so it reaches the learner's other devices with the next sync.
    expect((await db.settings.toArray())[0]).toMatchObject({ mainClassId: SECOND });
  });
});
