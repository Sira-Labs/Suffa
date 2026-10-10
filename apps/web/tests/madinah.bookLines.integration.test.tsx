/**
 * Marked lines of the Medina book: the line the author reads is highlighted on the page,
 * tapping a line plays it, and admins find, time and save the lines.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { MadinahLessonPage } from '@/modules/units/MadinahLesson';
import { useSettingsStore } from '@/state';

// jsdom has no PointerEvent; drawing a line needs its coordinates.
if (!('PointerEvent' in window)) {
  class PointerEvent extends MouseEvent {
    pointerId: number;
    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init);
      this.pointerId = init.pointerId ?? 0;
    }
  }
  Object.assign(window, { PointerEvent });
}

const role = vi.hoisted(() => ({ current: null as string | null }));
vi.mock('@/modules/account/useRole', () => ({ useRole: () => role.current }));
vi.mock('@/services/speech/tts', () => ({ speakArabic: vi.fn() }));
vi.mock('@/services/courses/lineDetection', () => ({
  detectLinesInImage: vi.fn(async () => [
    [0.1, 0.1, 0.8, 0.04],
    [0.1, 0.2, 0.8, 0.04],
  ]),
}));
vi.mock('@/services/courses/pauseDetection', async (original) => ({
  ...(await original<typeof import('@/services/courses/pauseDetection')>()),
  decodeRecording: vi.fn(async () => ({ samples: new Float32Array(10), sampleRate: 10 })),
  speechSegments: vi.fn(() => [
    { start: 1, end: 4 },
    { start: 5, end: 8 },
  ]),
}));

// Lesson 3 runs from page 11 to page 17.
const LESSON_3 = {
  lesson: 3,
  revision: 2,
  pages: [
    { page: 11, at: 0 },
    { page: 12, at: 30 },
  ],
  lines: [
    { page: 11, box: [0.1, 0.1, 0.8, 0.05], start: 1, end: 5 },
    { page: 11, box: [0.1, 0.2, 0.8, 0.05], start: 5, end: 9 },
    { page: 12, box: [0.1, 0.1, 0.8, 0.05], start: 31, end: 36 },
  ],
};

function stubApi(saved?: (body: unknown) => void) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url === '/api/v1/book-sync/madinah/1') {
        return new Response(
          JSON.stringify({ course: 'madinah', book: 1, lessons: [LESSON_3] })
        );
      }
      if (url === '/api/v1/book-sync/madinah/1/3' && init?.method === 'PUT') {
        saved?.(JSON.parse(String(init.body)));
        return new Response(JSON.stringify({ revision: 3 }));
      }
      return new Response('{}', { status: 404 });
    })
  );
}

function renderLesson() {
  const router = createMemoryRouter(
    [{ path: '/units/madinah/:lesson', element: <MadinahLessonPage /> }],
    { initialEntries: ['/units/madinah/3'] }
  );
  return render(<RouterProvider router={router} />);
}

function recording() {
  const audio = screen.getByLabelText('Aufnahme Lektion 3') as HTMLAudioElement;
  const state = { time: 0 };
  Object.defineProperty(audio, 'currentTime', {
    configurable: true,
    get: () => state.time,
    set: (v: number) => (state.time = v),
  });
  Object.defineProperty(audio, 'paused', { configurable: true, get: () => false });
  return {
    audio,
    play: () => fireEvent.play(audio),
    at(seconds: number) {
      state.time = seconds;
      fireEvent.timeUpdate(audio);
    },
  };
}

const book = () => screen.getByRole('region', { name: 'Im Buch' });

describe('Medina book lines', () => {
  beforeEach(async () => {
    localStorage.clear();
    role.current = null;
    await useSettingsStore.getState().load();
  });
  afterEach(() => vi.unstubAllGlobals());

  it('highlights the line being read and plays a line when tapped', async () => {
    stubApi();
    renderLesson();
    await screen.findByRole('button', { name: /Buch folgt der Aufnahme/ });
    const rec = recording();
    rec.play();
    rec.at(6);
    const lines = within(book()).getByRole('group', { name: 'Zeilen dieser Seite' });
    const second = within(lines).getByRole('button', { name: 'Zeile 2 von 2 abspielen' });
    expect(second).toHaveAttribute('aria-current', 'true');
    expect(
      within(lines).getByRole('button', { name: 'Zeile 1 von 2 abspielen' })
    ).not.toHaveAttribute('aria-current');

    // The line on the next page turns the page with it.
    rec.at(32);
    expect(within(book()).getByRole('img')).toHaveAttribute('alt', 'Buchseite 12');
    expect(
      within(book()).getByRole('button', { name: 'Zeile 1 von 1 abspielen' })
    ).toHaveAttribute('aria-current', 'true');

    // Back on page 11, tapping the first line plays from its start.
    await userEvent.click(within(book()).getByRole('button', { name: '← Seite' }));
    await userEvent.click(
      within(book()).getByRole('button', { name: 'Zeile 1 von 2 abspielen' })
    );
    expect(rec.audio.currentTime).toBe(1);
  });

  it('lets admins find, time and save the lines', async () => {
    role.current = 'admin';
    let body: { lines: { page: number; start: number; end: number }[] } | null = null;
    stubApi((b) => (body = b as typeof body));
    renderLesson();
    const rec = recording();
    rec.play();
    await userEvent.click(
      await within(book()).findByRole('button', { name: 'Zeilen bearbeiten (Admin)' })
    );
    const editor = () =>
      within(book()).getByRole('group', { name: 'Zeilen dieser Seite bearbeiten' });
    // The saved lines of page 11 are there to edit.
    expect(within(editor()).getAllByRole('button')).toHaveLength(2);

    await userEvent.click(
      within(book()).getByRole('button', { name: 'Zeilen erkennen' })
    );
    expect(await within(book()).findByText('2 Zeilen gefunden.')).toBeTruthy();
    expect(
      within(editor()).getByRole('button', { name: 'Zeile 1, noch ohne Zeit' })
    ).toBeTruthy();

    await userEvent.click(within(book()).getByRole('button', { name: 'Pausen suchen' }));
    expect(await within(book()).findByText('2 Sprechabschnitte gefunden.')).toBeTruthy();
    await userEvent.click(
      within(book()).getByRole('button', { name: 'Zeiten vorschlagen' })
    );
    expect(
      within(editor()).getByRole('button', { name: 'Zeile 2, ab 5.0 s' })
    ).toBeTruthy();

    // Tapping along corrects a start: a late tap goes back to its stretch of speech.
    await userEvent.click(within(book()).getByRole('button', { name: 'Mittippen' }));
    rec.at(5.8);
    await userEvent.click(
      within(editor()).getByRole('button', { name: 'Zeile 2, ab 5.0 s' })
    );
    expect(
      within(editor()).getByRole('button', { name: 'Zeile 2, ab 5.0 s' })
    ).toBeTruthy();

    await userEvent.click(
      within(book()).getByRole('button', { name: 'Zeilen speichern' })
    );
    await waitFor(() => expect(body).not.toBeNull());
    expect(body!.lines.map((l) => [l.page, l.start, l.end])).toEqual([
      [11, 1, 5],
      [11, 5, 31],
      [12, 31, 36],
    ]);
    expect(await within(book()).findByText('Gespeichert (Stand 3).')).toBeTruthy();
  });

  it('removes a selected line and draws a new one', async () => {
    role.current = 'admin';
    stubApi();
    renderLesson();
    recording().play();
    await userEvent.click(
      await within(book()).findByRole('button', { name: 'Zeilen bearbeiten (Admin)' })
    );
    const editor = within(book()).getByRole('group', {
      name: 'Zeilen dieser Seite bearbeiten',
    });
    await userEvent.click(
      within(editor).getByRole('button', { name: 'Zeile 1, ab 1.0 s' })
    );
    await userEvent.click(
      within(book()).getByRole('button', { name: 'Zeile entfernen' })
    );
    expect(within(editor).getAllByRole('button')).toHaveLength(1);

    await userEvent.click(within(book()).getByRole('button', { name: 'Zeile zeichnen' }));
    const area = book().querySelector('.book-lines') as HTMLElement;
    area.getBoundingClientRect = () =>
      ({ left: 0, top: 0, width: 400, height: 500, right: 400, bottom: 500 }) as DOMRect;
    area.setPointerCapture = () => undefined;
    fireEvent.pointerDown(area, { clientX: 40, clientY: 300, pointerId: 1 });
    fireEvent.pointerMove(area, { clientX: 360, clientY: 330, pointerId: 1 });
    fireEvent.pointerUp(area, { clientX: 360, clientY: 330, pointerId: 1 });
    expect(within(area).getAllByRole('button')).toHaveLength(2);
    expect(
      within(area).getByRole('button', { name: 'Zeile 2, noch ohne Zeit' })
    ).toBeTruthy();
  });
});
