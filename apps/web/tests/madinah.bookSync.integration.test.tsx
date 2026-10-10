/**
 * The Medina book follows the author's recording: playing opens the book at the lesson, the
 * pages turn with the recording where an admin has set the page turns, flipping by hand while
 * it plays stops following, and admins tap the page turns along and save them.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { MadinahLessonPage } from '@/modules/units/MadinahLesson';
import { useSettingsStore } from '@/state';

const role = vi.hoisted(() => ({ current: null as string | null }));
vi.mock('@/modules/account/useRole', () => ({ useRole: () => role.current }));
vi.mock('@/services/speech/tts', () => ({ speakArabic: vi.fn() }));

// Lesson 3 runs from page 11 to page 17.
const LESSON_3 = {
  lesson: 3,
  revision: 4,
  pages: [
    { page: 11, at: 0 },
    { page: 12, at: 30 },
    { page: 13, at: 60 },
  ],
  lines: [],
};

function stubApi(lessons: object[], saved?: (body: unknown) => void) {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url === '/api/v1/book-sync/madinah/1') {
      return new Response(JSON.stringify({ course: 'madinah', book: 1, lessons }), {
        status: 200,
      });
    }
    if (url === '/api/v1/book-sync/madinah/1/3' && init?.method === 'PUT') {
      saved?.(JSON.parse(String(init.body)));
      return new Response(JSON.stringify({ revision: 5 }), { status: 200 });
    }
    return new Response('{}', { status: 404 });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function renderLesson(n: number) {
  const router = createMemoryRouter(
    [{ path: '/units/madinah/:lesson', element: <MadinahLessonPage /> }],
    { initialEntries: [`/units/madinah/${n}`] }
  );
  return render(<RouterProvider router={router} />);
}

/** The recording, with a playing time and paused state the test controls. */
function recording(n: number) {
  const audio = screen.getByLabelText(`Aufnahme Lektion ${n}`) as HTMLAudioElement;
  const state = { time: 0, paused: true };
  Object.defineProperty(audio, 'currentTime', {
    configurable: true,
    get: () => state.time,
  });
  Object.defineProperty(audio, 'paused', { configurable: true, get: () => state.paused });
  return {
    play() {
      state.paused = false;
      fireEvent.play(audio);
    },
    at(seconds: number) {
      state.time = seconds;
      fireEvent.timeUpdate(audio);
    },
  };
}

const book = () => screen.getByRole('region', { name: 'Im Buch' });
const shownPage = () => within(book()).getByRole('img').getAttribute('alt');

describe('Medina book follows the recording', () => {
  beforeEach(async () => {
    localStorage.clear();
    role.current = null;
    await useSettingsStore.getState().load();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('opens the book with the recording and turns the pages along', async () => {
    const fetchMock = stubApi([LESSON_3]);
    renderLesson(3);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const follow = await screen.findByRole('button', { name: /Buch folgt der Aufnahme/ });
    expect(follow).toHaveAttribute('aria-pressed', 'true');
    expect(within(book()).queryByRole('img')).toBeNull();

    const audio = recording(3);
    audio.play();
    expect(shownPage()).toBe('Buchseite 11');
    audio.at(35);
    expect(shownPage()).toBe('Buchseite 12');
    audio.at(61);
    expect(shownPage()).toBe('Buchseite 13');

    // Reading back while it plays: the book stays where the learner is.
    await userEvent.click(within(book()).getByRole('button', { name: '← Seite' }));
    expect(shownPage()).toBe('Buchseite 12');
    expect(follow).toHaveAttribute('aria-pressed', 'false');
    audio.at(65);
    expect(shownPage()).toBe('Buchseite 12');
    // …until it follows the recording again.
    await userEvent.click(follow);
    expect(follow).toHaveAttribute('aria-pressed', 'true');
    expect(shownPage()).toBe('Buchseite 13');
  });

  it('opens the book at the lesson without page turns', async () => {
    stubApi([]);
    renderLesson(3);
    const audio = recording(3);
    audio.play();
    expect(shownPage()).toBe('Buchseite 11');
    audio.at(200);
    expect(shownPage()).toBe('Buchseite 11');
    expect(screen.queryByRole('button', { name: /Buch folgt der Aufnahme/ })).toBeNull();
  });

  it('follows the recording offline with the copy kept on the device', async () => {
    const online = stubApi([LESSON_3]);
    const first = renderLesson(3);
    await waitFor(() => expect(online).toHaveBeenCalled());
    await screen.findByRole('button', { name: /Buch folgt der Aufnahme/ });
    first.unmount();

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('offline');
      })
    );
    renderLesson(3);
    await screen.findByRole('button', { name: /Buch folgt der Aufnahme/ });
    const audio = recording(3);
    audio.play();
    audio.at(40);
    expect(shownPage()).toBe('Buchseite 12');
  });

  it('lets admins tap the page turns along and save them', async () => {
    role.current = 'admin';
    let body: unknown = null;
    stubApi([LESSON_3], (b) => (body = b));
    renderLesson(3);
    const editor = await screen.findByRole('region', {
      name: 'Seitenwechsel festlegen (Admin)',
    });
    const start = (page: number) =>
      within(editor).getByLabelText(`Beginn S. ${page} in Sekunden`);
    expect(start(11)).toHaveValue(0);
    expect(start(12)).toHaveValue(30);
    expect(start(14)).toHaveValue(null);

    const audio = recording(3);
    audio.play();
    audio.at(91.26);
    const row = start(14).closest('li')!;
    await userEvent.click(within(row).getByRole('button', { name: 'Jetzt' }));
    expect(start(14)).toHaveValue(91.3);
    expect(within(row).getByText('1:31.3')).toBeTruthy();

    await userEvent.click(
      within(editor).getByRole('button', { name: 'Zeiten speichern' })
    );
    expect(await within(editor).findByText('Gespeichert (Stand 5).')).toBeTruthy();
    expect(body).toEqual({
      revision: 4,
      pages: [...LESSON_3.pages, { page: 14, at: 91.3 }],
      lines: [],
    });
    // The new turn is used right away.
    audio.at(95);
    expect(shownPage()).toBe('Buchseite 14');
  });

  it('refuses page turns out of the recording order', async () => {
    role.current = 'admin';
    const fetchMock = stubApi([LESSON_3]);
    renderLesson(3);
    const editor = await screen.findByRole('region', {
      name: 'Seitenwechsel festlegen (Admin)',
    });
    const input = within(editor).getByLabelText('Beginn S. 13 in Sekunden');
    await userEvent.clear(input);
    await userEvent.type(input, '10');
    await userEvent.click(
      within(editor).getByRole('button', { name: 'Zeiten speichern' })
    );
    expect(
      within(editor).getByText(
        'Die Seiten müssen in der Reihenfolge der Aufnahme beginnen.'
      )
    ).toBeTruthy();
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'PUT')).toBe(false);
  });

  it('shows no editor to learners', async () => {
    stubApi([LESSON_3]);
    renderLesson(3);
    await screen.findByRole('button', { name: /Buch folgt der Aufnahme/ });
    expect(screen.queryByRole('region', { name: /Seitenwechsel/ })).toBeNull();
  });

  it('refuses a time that is not a number of seconds', async () => {
    role.current = 'admin';
    const fetchMock = stubApi([LESSON_3]);
    renderLesson(3);
    const editor = await screen.findByRole('region', {
      name: 'Seitenwechsel festlegen (Admin)',
    });
    const input = within(editor).getByLabelText('Beginn S. 14 in Sekunden');
    await userEvent.type(input, '-5');
    await userEvent.click(
      within(editor).getByRole('button', { name: 'Zeiten speichern' })
    );
    expect(
      within(editor).getByText('Die Zeit für S. 14 ist keine gültige Sekundenzahl.')
    ).toBeTruthy();
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'PUT')).toBe(false);
  });
});
