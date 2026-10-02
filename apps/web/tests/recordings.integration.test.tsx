import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { ClassRecordings } from '@/modules/classes/ClassRecordings';
import { RecordingPlayer } from '@/modules/classes/RecordingPlayer';
import { db } from '@/services/storage';
import { useListenStore } from '@/state';

const CLASS = '11111111-1111-4111-8111-111111111111';
const MEDIA = '22222222-2222-4222-8222-222222222222';
const item = {
  id: MEDIA,
  title: 'Stunde 1',
  source: 'upload',
  status: 'ready',
  progress: 100,
  durationSec: 100,
  hasVideo: false,
  originalName: 'stunde1.m4a',
  originalSize: 1000,
  error: null,
  publishedAt: '2026-09-24T10:00:00.000Z',
  createdAt: '2026-09-24T09:00:00.000Z',
};

function stubApi() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const path = String(input);
      if (path.endsWith('/play')) {
        return Response.json({
          ...item,
          audio: '/media/suffa-media/x/audio.m4a',
          video: null,
        });
      }
      if (path.endsWith('/listening')) {
        return Response.json({
          recordings: [
            {
              mediaId: MEDIA,
              learners: 3,
              started: 2,
              finished: 1,
              people: [
                {
                  userId: 'a',
                  name: 'Amina',
                  percent: 100,
                  completedAt: '2026-09-25T10:00:00Z',
                },
                { userId: 'b', name: 'Bilal', percent: 40, completedAt: null },
                { userId: 'c', name: 'Chadi', percent: 0, completedAt: null },
              ],
            },
          ],
        });
      }
      if (path.endsWith('/media')) {
        return Response.json({
          items: [
            item,
            {
              ...item,
              id: 'p',
              title: 'Stunde 2',
              status: 'processing',
              progress: 40,
              publishedAt: null,
            },
          ],
        });
      }
      return new Response(null, { status: 404 });
    })
  );
}

/** Sprint 7: class recordings list and player. */
describe('Recordings (integration)', () => {
  beforeEach(async () => {
    await db.media_progress.clear();
    await useListenStore.getState().load();
    stubApi();
  });
  afterEach(() => vi.unstubAllGlobals());

  it('shows the teacher processing progress and links ready recordings', async () => {
    const router = createMemoryRouter(
      [{ path: '/', element: <ClassRecordings classId={CLASS} teacher /> }],
      { initialEntries: ['/'] }
    );
    render(<RouterProvider router={router} />);
    expect(await screen.findByRole('link', { name: 'Stunde 1' })).toHaveAttribute(
      'href',
      `/classes/${CLASS}/recordings/${MEDIA}`
    );
    expect(screen.getByRole('progressbar', { name: /Stunde 2/ })).toHaveAttribute(
      'aria-valuenow',
      '40'
    );
    expect(screen.getByRole('form', { name: 'Aufnahme hochladen' })).toBeInTheDocument();
  });

  it('shows the teacher who of the class has listened to a recording', async () => {
    const router = createMemoryRouter(
      [{ path: '/', element: <ClassRecordings classId={CLASS} teacher /> }],
      { initialEntries: ['/'] }
    );
    render(<RouterProvider router={router} />);
    const summary = await screen.findByText(/von 3/);
    expect(summary.closest('summary')?.textContent).toBe('1 von 3 gehört · 1 angefangen');
    await userEvent.click(summary);
    const list = screen.getByRole('list', { name: 'Wer „Stunde 1“ gehört hat' });
    expect(list.textContent).toContain('Amina✓ gehört');
    expect(list.textContent).toContain('Bilal40 %');
    expect(list.textContent).toContain('Chadinoch nicht');
    expect(
      screen.getByRole('progressbar', { name: 'Bilal: 40 % gehört' })
    ).toHaveAttribute('aria-valuenow', '40');
  });

  it('tells the teacher when the listening report fails, and loads it again', async () => {
    const base = globalThis.fetch;
    let fail = true;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        if (fail && String(input).endsWith('/listening')) {
          return Response.json({ error: 'internal' }, { status: 500 });
        }
        return base(input, init);
      })
    );
    const router = createMemoryRouter(
      [{ path: '/', element: <ClassRecordings classId={CLASS} teacher /> }],
      { initialEntries: ['/'] }
    );
    render(<RouterProvider router={router} />);
    expect(await screen.findByText(/Wer zugehört hat, lässt sich gerade nicht laden/));
    fail = false;
    await userEvent.click(screen.getByRole('button', { name: 'Erneut laden' }));
    expect(await screen.findByText(/von 3/)).toBeTruthy();
    expect(screen.queryByText(/lässt sich gerade nicht laden/)).toBeNull();
  });

  it('shows learners no listening statistics', async () => {
    const router = createMemoryRouter(
      [{ path: '/', element: <ClassRecordings classId={CLASS} teacher={false} /> }],
      { initialEntries: ['/'] }
    );
    render(<RouterProvider router={router} />);
    await screen.findByRole('link', { name: 'Stunde 1' });
    expect(screen.queryByText(/von 3/)).toBeNull();
    const calls = (globalThis.fetch as unknown as { mock: { calls: unknown[][] } }).mock
      .calls;
    expect(calls.some(([url]) => String(url).endsWith('/listening'))).toBe(false);
  });

  it('lets the teacher rename a recording uploaded under the wrong title', async () => {
    const sent: { method: string; body: unknown }[] = [];
    const base = globalThis.fetch;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === 'PATCH') {
          sent.push({ method: 'PATCH', body: JSON.parse(String(init.body)) });
          return new Response(null, { status: 204 });
        }
        return base(input, init);
      })
    );
    const router = createMemoryRouter(
      [{ path: '/', element: <ClassRecordings classId={CLASS} teacher /> }],
      { initialEntries: ['/'] }
    );
    render(<RouterProvider router={router} />);
    await screen.findByRole('link', { name: 'Stunde 1' });
    await userEvent.click(screen.getAllByRole('button', { name: 'Umbenennen' })[0]!);
    const input = screen.getByRole('textbox', { name: 'Neuer Titel' });
    expect(input).toHaveValue('Stunde 1');
    await userEvent.clear(input);
    expect(screen.getByRole('button', { name: 'Speichern' })).toBeDisabled();
    await userEvent.type(input, ' Stunde 5 – Wiederholung {Enter}');
    expect(sent).toEqual([
      { method: 'PATCH', body: { title: 'Stunde 5 – Wiederholung' } },
    ]);
    expect(screen.queryByRole('textbox', { name: 'Neuer Titel' })).toBeNull();
  });

  it('keeps the rename editor open when saving fails', async () => {
    const base = globalThis.fetch;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === 'PATCH') {
          return new Response(JSON.stringify({ error: 'invalid' }), { status: 400 });
        }
        return base(input, init);
      })
    );
    const router = createMemoryRouter(
      [{ path: '/', element: <ClassRecordings classId={CLASS} teacher /> }],
      { initialEntries: ['/'] }
    );
    render(<RouterProvider router={router} />);
    await screen.findByRole('link', { name: 'Stunde 1' });
    await userEvent.click(screen.getAllByRole('button', { name: 'Umbenennen' })[0]!);
    const input = screen.getByRole('textbox', { name: 'Neuer Titel' });
    await userEvent.clear(input);
    await userEvent.type(input, 'Neu{Enter}');
    expect(await screen.findByRole('textbox', { name: 'Neuer Titel' })).toHaveValue(
      'Neu'
    );
  });

  it('counts played time, not seeking, and marks the recording heard at 85 %', async () => {
    const router = createMemoryRouter(
      [{ path: '/classes/:id/recordings/:mediaId', element: <RecordingPlayer /> }],
      { initialEntries: [`/classes/${CLASS}/recordings/${MEDIA}`] }
    );
    render(<RouterProvider router={router} />);
    const audio = (await screen.findByLabelText('Stunde 1')) as HTMLAudioElement;
    let time = 0;
    Object.defineProperty(audio, 'currentTime', { get: () => time, configurable: true });
    Object.defineProperty(audio, 'duration', { get: () => 100, configurable: true });
    fireEvent.play(audio);
    // A jump (seek) to 50 s counts nothing.
    time = 50;
    fireEvent.timeUpdate(audio);
    // Then 90 s of real playing, in steps of one second.
    for (let t = 51; t <= 140; t++) {
      time = t;
      fireEvent.timeUpdate(audio);
    }
    fireEvent.pause(audio);
    await vi.waitFor(() => {
      const heard = useListenStore.getState().progress[`rec/${MEDIA}`];
      expect(heard).toMatchObject({ source: 'recording', durationSec: 100 });
      expect(heard!.listenedSec).toBe(90);
      expect(heard!.completedAt).not.toBeNull();
    });
  });
});
