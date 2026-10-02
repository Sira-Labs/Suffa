/**
 * Course-aware screens (ADR-0025, roadmap R3): a Medina learner sees their own book on "Heute",
 * in "Prüfung" and in "Hören & Sehen", and Medina unit numbers lead to the lesson pages.
 */
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider, useParams } from 'react-router-dom';
import { Dashboard } from '@/modules/dashboard';
import { Exam } from '@/modules/exam/Exam';
import { Library } from '@/modules/library/Library';
import { UnitPath } from '@/modules/units/UnitPath';
import { examRepo, db } from '@/services/storage';
import { madinahProgress } from '@/services/courses';
import {
  useCheckInStore,
  useContentStore,
  useEnrollmentStore,
  useListenStore,
  usePracticeStore,
  useSettingsStore,
  useSrsStore,
} from '@/state';

function LessonStub() {
  const { lesson } = useParams();
  return <h1>Lektionsseite {lesson}</h1>;
}

function renderAt(path: string) {
  const router = createMemoryRouter(
    [
      { path: '/', element: <Dashboard /> },
      { path: '/exam', element: <Exam /> },
      { path: '/library', element: <Library /> },
      { path: '/units/madinah/:lesson', element: <LessonStub /> },
      { path: '/units/:unit', element: <UnitPath /> },
    ],
    { initialEntries: [path] }
  );
  return render(<RouterProvider router={router} />);
}

/** Stores a lesson test of a Medina unit with the given score out of 10. */
async function lessonTest(unit: number, score: number) {
  await examRepo.add({
    format: 'madinah_lesson',
    units: [unit],
    score,
    total: 10,
    items: [],
    startedAt: '2026-10-01T10:00:00.000Z',
    finishedAt: '2026-10-01T10:05:00.000Z',
  });
  await useEnrollmentStore.getState().reloadExams();
}

describe('Course-aware screens (Medina course)', () => {
  beforeAll(() => {
    // jsdom has no ResizeObserver; charts only need the constructor.
    globalThis.ResizeObserver ??= class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  });

  beforeEach(async () => {
    await Promise.all([
      db.settings.clear(),
      db.exam_results.clear(),
      db.unit_enrollments.clear(),
      db.daily_checkins.clear(),
    ]);
    await useSettingsStore.getState().load();
    await useContentStore.getState().load();
    await useSrsStore.getState().load();
    await useListenStore.getState().load();
    await usePracticeStore.getState().load();
    await useEnrollmentStore.getState().load();
    await useCheckInStore.getState().load();
    await useSettingsStore.getState().update({ course: 'madinah' });
  });

  it('counts passed lesson tests and names the next lesson', async () => {
    expect(madinahProgress([]).next?.lesson.lesson).toBe(1);
    await lessonTest(101, 9);
    await lessonTest(102, 5); // below 80 %: not passed
    const progress = madinahProgress(useEnrollmentStore.getState().exams);
    expect(progress.passed).toBe(1);
    expect(progress.lessons).toHaveLength(23);
    expect(progress.next?.lesson.lesson).toBe(2);
  });

  it('shows the next Medina lesson and Book 1 on "Heute"', async () => {
    await lessonTest(101, 10);
    renderAt('/');
    const card = (await screen.findByRole('heading', { name: /^Lektion 2/ })).closest(
      'section'
    )!;
    expect(within(card).getByText('Deine Lektion')).toBeTruthy();
    expect(within(card).getByRole('link', { name: /Lektion 2 öffnen/ })).toHaveAttribute(
      'href',
      '/units/madinah/2'
    );
    expect(await screen.findByText('Medina-Kurs · Buch 1')).toBeTruthy();
    expect(screen.getByText('1 von 23 Lektionen')).toBeTruthy();
    expect(screen.getByText('Als Nächstes: Lektionstest Lektion 2')).toBeTruthy();
    expect(
      screen.getByText('Etappe 1: 1 von 12 Lektionen bis zum Abzeichen „Erste Schritte“')
    ).toBeTruthy();
    // Nothing of the other course's level map.
    expect(screen.queryByText(/Stufe 1/)).toBeNull();
    expect(screen.queryByText('Deine Einheit')).toBeNull();
  });

  it('lists the lesson tests in "Prüfung"', async () => {
    await lessonTest(101, 8);
    renderAt('/exam');
    const list = await screen.findByRole('list', { name: 'Lektionstests' });
    const items = within(list).getAllByRole('listitem');
    expect(items).toHaveLength(23);
    expect(within(items[0]!).getByText('✓ bestanden')).toBeTruthy();
    expect(within(items[1]!).getByText('offen')).toBeTruthy();
    expect(screen.getByRole('link', { name: /Zum Test von Lektion 2/ })).toHaveAttribute(
      'href',
      '/units/madinah/2'
    );
  });

  it('plays the author\'s recording per lesson in "Hören & Sehen"', async () => {
    renderAt('/library?lesson=3');
    expect(await screen.findByRole('heading', { name: /^Lektion 3/ })).toBeTruthy();
    expect(screen.getByLabelText('Aufnahme Lektion 3')).toHaveAttribute(
      'src',
      expect.stringContaining('archive.org')
    );
    await userEvent.click(screen.getByRole('button', { name: 'Nächste Lektion' }));
    expect(screen.getByRole('heading', { name: /^Lektion 4/ })).toBeTruthy();
    expect(screen.queryByText(/Buchseiten-Videos/)).toBeNull();
  });

  it('leads a Medina unit number to its lesson page', async () => {
    renderAt('/units/103');
    expect(await screen.findByRole('heading', { name: 'Lektionsseite 3' })).toBeTruthy();
  });
});
