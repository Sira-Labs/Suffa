import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { UnitPath, UnitStation, Units } from '@/modules/units';
import { db, examRepo } from '@/services/storage';
import {
  useContentStore,
  useEnrollmentStore,
  useListenStore,
  usePracticeStore,
  useSettingsStore,
  useSrsStore,
} from '@/state';

function renderAt(path: string) {
  const router = createMemoryRouter(
    [
      { path: '/units', element: <Units /> },
      { path: '/units/:unit', element: <UnitPath /> },
      { path: '/units/:unit/:station', element: <UnitStation /> },
    ],
    { initialEntries: [path] }
  );
  return render(<RouterProvider router={router} />);
}

async function passUnitTest(unit: number) {
  const now = new Date().toISOString();
  await examRepo.add({
    format: 'mixed_chapter',
    units: [unit],
    score: 9,
    total: 10,
    items: [],
    startedAt: now,
    finishedAt: now,
  });
  await useEnrollmentStore.getState().reloadExams();
}

/** Step 2: start a unit with a pace, soft deadline with one extension, unlock by test. */
describe('Unit enrollment (integration)', () => {
  beforeEach(async () => {
    await Promise.all([
      db.exam_results.clear(),
      db.unit_enrollments.clear(),
      db.practice_progress.clear(),
    ]);
    await useSettingsStore.getState().load();
    await useContentStore.getState().load();
    await useSrsStore.getState().load();
    await useListenStore.getState().load();
    await usePracticeStore.getState().load();
    await useEnrollmentStore.getState().load();
  });

  it('keeps unit 2 locked until the test of unit 1 is passed', async () => {
    renderAt('/units/2');
    expect(
      await screen.findByRole('heading', { name: 'Noch gesperrt' })
    ).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Lernpfad Einheit 2' })).toBeNull();
  });

  it('marks locked units on the book map', async () => {
    renderAt('/units');
    const grid = await screen.findByRole('list', { name: 'Alle Einheiten' });
    expect(
      within(grid).getByRole('link', { name: /^Einheit 2.*gesperrt$/ })
    ).toBeTruthy();
    expect(
      within(grid).getByRole('link', { name: /^Einheit 1.*erledigt$/ })
    ).toBeTruthy();
  });

  it('starts a unit with the chosen pace and shows the countdown', async () => {
    const user = userEvent.setup();
    renderAt('/units/1');
    await screen.findByRole('heading', { name: 'Dein Tempo für Einheit 1' });
    await user.click(screen.getByRole('radio', { name: /Intensiv/ }));
    await user.click(screen.getByRole('button', { name: 'Einheit 1 beginnen' }));
    expect(await screen.findByText(/noch 7 Tage/)).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'Dein Tempo für Einheit 1' })
    ).toBeNull();
    expect(useEnrollmentStore.getState().enrollments[1]).toMatchObject({
      pace: 'intensive',
    });
  });

  it('lets an overdue unit be extended once', async () => {
    const user = userEvent.setup();
    const past = new Date();
    past.setDate(past.getDate() - 20);
    await useEnrollmentStore.getState().start(1, 'normal', past);
    renderAt('/units/1');
    expect(await screen.findByText(/Frist seit 6 Tagen vorbei/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Um 7 Tage verlängern' }));
    expect(await screen.findByText(/noch 7 Tage/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /verlängern/ })).toBeNull();
  });

  it('opens unit 2 once unit 1 is passed', async () => {
    await passUnitTest(1);
    renderAt('/units/2');
    expect(
      await screen.findByRole('heading', { name: 'Dein Tempo für Einheit 2' })
    ).toBeInTheDocument();
  });
});
