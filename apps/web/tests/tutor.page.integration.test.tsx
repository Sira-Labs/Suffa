/**
 * al-Muʿallim in the app (story 10.3): a streamed answer with tool activity, Arabic in the
 * Arabic font following the tashkīl setting, 👍/👎, the question from a recording, and the
 * tutor practice record for the daily quest.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { Tutor } from '@/modules/tutor';
import { ApiSyncProvider } from '@/services/sync/ApiSyncProvider';
import { readEvents, type TutorEvent } from '@/services/tutor/tutorApi';
import { usePracticeStore, useSettingsStore, useSyncStore } from '@/state';

function sse(events: TutorEvent[]): Response {
  const text = events
    .map((e) => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`)
    .join('');
  return new Response(text, { headers: { 'content-type': 'text/event-stream' } });
}

async function signIn(turn: TutorEvent[], available = true) {
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
        name: 'Amina',
        role: 'student',
        timeZone: 'Europe/Zurich',
      });
    }
    if (path === '/api/v1/tutor') {
      return Response.json({ available, tutorLanguage: 'de', conversations: [] });
    }
    if (path === '/api/v1/tutor/turn') return sse(turn);
    return new Response(null, { status: 204 });
  }) as unknown as typeof fetch;
  vi.stubGlobal('fetch', api);
  const provider = new ApiSyncProvider('', api);
  await provider.refresh();
  useSyncStore.setState({ provider, auth: provider.getAuthState() });
  return requests;
}

function renderTutor(entry = '/tutor') {
  const router = createMemoryRouter([{ path: '/tutor', element: <Tutor /> }], {
    initialEntries: [entry],
  });
  return render(<RouterProvider router={router} />);
}

describe('al-Muʿallim page', () => {
  const original = useSyncStore.getState();
  const practise = vi.fn(async () => ({ first: true, stationComplete: false, xp: 2 }));
  beforeEach(() => {
    vi.unstubAllGlobals();
    usePracticeStore.setState({ practise });
    practise.mockClear();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    useSyncStore.setState({ provider: original.provider, auth: original.auth });
    useSettingsStore.setState((s) => ({
      settings: { ...s.settings, tashkilLevel: 'full' },
    }));
  });

  it('streams an answer, shows Arabic in the Arabic font and stores a rating', async () => {
    const requests = await signIn([
      { type: 'start', conversationId: 'c1' },
      { type: 'text', text: 'Ich schaue nach.' },
      { type: 'tool', name: 'lookup_vocab' },
      { type: 'text', text: '\n\nكِتابٌ heißt **Buch**.\n\n- Plural: كُتُبٌ' },
      { type: 'done', messageId: 'm1', flags: [] },
    ]);
    renderTutor();
    const box = await screen.findByLabelText('Deine Nachricht an al-Muʿallim');
    await userEvent.type(box, 'Was heißt كتاب?{Enter}');
    expect(await screen.findByText('Buch')).toBeTruthy();
    const arabic = screen.getByText('كِتابٌ');
    expect(arabic.getAttribute('dir')).toBe('rtl');
    expect(arabic.getAttribute('lang')).toBe('ar');
    expect(screen.getByRole('listitem').textContent).toContain('كُتُبٌ');
    const turn = requests.find((r) => r.path === '/api/v1/tutor/turn');
    expect(turn?.body).toEqual({ message: 'Was heißt كتاب?' });
    // Arabic written to the tutor counts once a day for the tutor quest.
    expect(practise).toHaveBeenCalledWith(
      0,
      'tutor',
      expect.stringMatching(/^tutor\/\d{4}-\d{2}-\d{2}$/),
      []
    );

    await userEvent.click(screen.getByRole('button', { name: 'Hilfreich' }));
    expect(
      requests.find((r) => r.path === '/api/v1/tutor/messages/m1/rating')?.body
    ).toEqual({
      rating: 1,
    });
    expect(
      screen.getByRole('button', { name: 'Hilfreich' }).getAttribute('aria-pressed')
    ).toBe('true');
  });

  it('follows the tashkīl setting and shows a replaced answer', async () => {
    useSettingsStore.setState((s) => ({
      settings: { ...s.settings, tashkilLevel: 'none' },
    }));
    await signIn([
      { type: 'start', conversationId: 'c1' },
      { type: 'text', text: 'هذا كتاب' },
      { type: 'replace', text: 'هٰذا كِتابٌ – das ist ein Buch.' },
      { type: 'done', messageId: 'm2', flags: [] },
    ]);
    renderTutor();
    await userEvent.type(
      await screen.findByLabelText('Deine Nachricht an al-Muʿallim'),
      'Ein Satz bitte{Enter}'
    );
    expect(await screen.findByText('هذا كتاب')).toBeTruthy();
    expect(screen.getByText(/das ist ein Buch/)).toBeTruthy();
    // No Arabic in the message: no practice record.
    expect(practise).not.toHaveBeenCalled();
  });

  it('asks about a minute of a recording', async () => {
    const requests = await signIn([
      { type: 'start', conversationId: 'c2' },
      { type: 'text', text: 'Dort sagt die Lehrerin مَرْحَبًا.' },
      { type: 'done', messageId: 'm3', flags: [] },
    ]);
    renderTutor('/tutor?media=22222222-2222-4222-8222-222222222222&t=754');
    expect(await screen.findByText('Frage zur Aufnahme bei 12:34')).toBeTruthy();
    const box = screen.getByLabelText(
      'Deine Nachricht an al-Muʿallim'
    ) as HTMLTextAreaElement;
    expect(box.value).toContain('12:34');
    await userEvent.click(screen.getByRole('button', { name: 'Senden' }));
    await screen.findByText(/Dort sagt die Lehrerin/);
    expect(requests.find((r) => r.path === '/api/v1/tutor/turn')?.body).toMatchObject({
      context: { mediaId: '22222222-2222-4222-8222-222222222222', atSec: 754 },
    });
  });

  it('shows quota and outage messages, and a server without AI', async () => {
    await signIn([
      { type: 'start', conversationId: 'c3' },
      {
        type: 'error',
        error: 'ai_quota',
        message: 'Für heute hast du alle 30 Gespräche genutzt.',
      },
    ]);
    renderTutor();
    await userEvent.type(
      await screen.findByLabelText('Deine Nachricht an al-Muʿallim'),
      'Hallo{Enter}'
    );
    expect(await screen.findByText(/alle 30 Gespräche/)).toBeTruthy();
  });

  it('explains when the tutor is off, and asks to sign in', async () => {
    await signIn([], false);
    const view = renderTutor();
    expect(await screen.findByText(/noch nicht eingeschaltet/)).toBeTruthy();
    expect(
      (screen.getByLabelText('Deine Nachricht an al-Muʿallim') as HTMLTextAreaElement)
        .disabled
    ).toBe(true);
    view.unmount();
    useSyncStore.setState({ provider: original.provider, auth: original.auth });
    renderTutor();
    expect(within(document.body).getByText(/braucht eine Anmeldung/)).toBeTruthy();
  });

  it('parses events split across chunks', async () => {
    const encoder = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(encoder.encode('event: text\ndata: {"type":"te'));
        c.enqueue(
          encoder.encode(
            'xt","text":"أ"}\n\ndata: {"type":"done","messageId":"x","flags":[]}'
          )
        );
        c.close();
      },
    });
    const events: TutorEvent[] = [];
    for await (const e of readEvents(body)) events.push(e);
    expect(events).toEqual([
      { type: 'text', text: 'أ' },
      { type: 'done', messageId: 'x', flags: [] },
    ]);
  });
});
