/** Video lessons in the app (Sprint 12): catalog, player with checkpoints, gloss, admin. */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { VideoAdmin } from '@/modules/admin/VideoAdmin';
import { GlossTranscript } from '@/modules/videos/GlossTranscript';
import { VideoLesson } from '@/modules/videos/VideoLesson';
import { VideoLessons } from '@/modules/videos/VideoLessons';
import type { YouTubeNamespace } from '@/services/discover/youtubeApi';
import { glossFor } from '@/services/videos/gloss';
import { VideosApi } from '@/services/videos/videosApi';
import { useListenStore, usePracticeStore } from '@/state';

const LESSON = {
  id: '11111111-1111-4111-8111-111111111111',
  youtubeId: 'aaaaaaaaaa1',
  title: 'الدرس ١ – التحية',
  durationSec: 600,
  thumbnailUrl: 'https://i.ytimg.com/a.jpg',
  unit: 1,
  channel: { name: 'Muhammad al-Andalusi' },
  interactive: true,
};

function apiWith(routes: Record<string, unknown>) {
  const requests: { method: string; path: string; body: unknown }[] = [];
  const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input);
    const method = init?.method ?? 'GET';
    requests.push({
      method,
      path,
      body: init?.body ? JSON.parse(String(init.body)) : null,
    });
    const hit = routes[`${method} ${path}`];
    if (hit === undefined)
      return new Response(null, { status: method === 'GET' ? 404 : 204 });
    return Response.json(hit);
  });
  return { api: new VideosApi(fetchImpl as typeof fetch), requests };
}

function renderAt(path: string, element: React.ReactNode, route: string) {
  const router = createMemoryRouter([{ path: route, element }], {
    initialEntries: [path],
  });
  return render(<RouterProvider router={router} />);
}

afterEach(() => vi.useRealTimers());

describe('Video lessons list', () => {
  it('lists lessons by unit and marks watched ones', async () => {
    useListenStore.setState({
      progress: {
        [`yt/${LESSON.id}`]: {
          id: `yt/${LESSON.id}`,
          completedAt: '2026-09-25T10:00:00Z',
        } as never,
      },
    });
    const { api } = apiWith({
      'GET /api/v1/videos': {
        videos: [
          LESSON,
          { ...LESSON, id: 'b', title: 'Lesson 3', unit: 3, interactive: false },
        ],
      },
    });
    renderAt('/videos', <VideoLessons api={api} />, '/videos');
    expect(await screen.findByText('الدرس ١ – التحية')).toBeTruthy();
    expect(screen.getByText(/mit Fragen · ✓ angesehen/)).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Einheit 3' }));
    expect(screen.queryByText('الدرس ١ – التحية')).toBeNull();
    expect(screen.getByText('Lesson 3')).toBeTruthy();
  });
});

describe('Video lesson player', () => {
  it('pauses at a checkpoint, resumes after the answer and counts the watched time', async () => {
    let now = 0;
    const calls: string[] = [];
    let onState: ((e: { data: number }) => void) | undefined;
    const YT = {
      PlayerState: { ENDED: 0, PLAYING: 1, PAUSED: 2 },
      Player: class {
        constructor(
          _el: HTMLIFrameElement,
          options: { events?: { onStateChange?: (e: { data: number }) => void } }
        ) {
          onState = options.events?.onStateChange;
        }
        getCurrentTime = () => now;
        getDuration = () => 600;
        pauseVideo = () => calls.push('pause');
        playVideo = () => calls.push('play');
        seekTo = (s: number) => calls.push(`seek ${s}`);
        destroy = () => calls.push('destroy');
      },
    } as unknown as YouTubeNamespace;
    const practise = vi.fn(async () => ({ first: true, stationComplete: false, xp: 2 }));
    const record = vi.fn(async () => ({
      trackHeard: false,
      lessonComplete: false,
      xp: 0,
    }));
    usePracticeStore.setState({ practise });
    useListenStore.setState({ record, progress: {} });
    const { api } = apiWith({
      [`GET /api/v1/videos/${LESSON.id}`]: {
        video: LESSON,
        checkpoints: [
          {
            id: 'cp1',
            atSec: 30,
            data: { kind: 'vocab_flash', ar: 'مَرْحَبًا', de: 'Hallo' },
          },
        ],
        transcript: [{ start: 28, end: 32, text: 'السَّلامُ عَلَيْكُمْ' }],
      },
    });
    const view = renderAt(
      `/videos/${LESSON.id}`,
      <VideoLesson api={api} loadApi={async () => YT} />,
      '/videos/:id'
    );
    const frame = (await screen.findByTitle(LESSON.title)) as HTMLIFrameElement;
    expect(frame.src).toContain('youtube-nocookie.com/embed/aaaaaaaaaa1');
    expect(frame.src).toContain('playsinline=1');
    // Playback runs up to the checkpoint.
    for (const t of [28.9, 29.4, 29.9, 30.3]) {
      now = t;
      await act(() => new Promise((r) => setTimeout(r, 300)));
    }
    const dialog = await screen.findByRole('dialog');
    expect(calls).toContain('pause');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Weiter' }));
    expect(calls.at(-1)).toBe('play');
    expect(practise).toHaveBeenCalledWith(0, 'checkpoint', `yt/${LESSON.id}/cp1`, []);
    // Ended: the watched seconds are saved as a video lesson track.
    onState?.({ data: 0 });
    await waitFor(() => expect(record).toHaveBeenCalled());
    const [track, seconds] = record.mock.calls[0] as unknown as [
      { id: string; source: string },
      number,
    ];
    expect(track).toMatchObject({ id: `yt/${LESSON.id}`, source: 'video-lesson' });
    expect(seconds).toBeGreaterThan(1);
    // The transcript jumps the video.
    await userEvent.click(screen.getByRole('button', { name: '0:28' }));
    expect(calls).toContain('seek 28');
    view.unmount();
    expect(calls).toContain('destroy');
  });

  it('says so when a lesson has no permission for exercises yet, or does not exist', async () => {
    const { api } = apiWith({
      [`GET /api/v1/videos/${LESSON.id}`]: {
        video: { ...LESSON, interactive: false },
        checkpoints: [],
        transcript: [],
      },
    });
    renderAt(
      `/videos/${LESSON.id}`,
      <VideoLesson api={api} loadApi={() => Promise.reject(new Error('offline'))} />,
      '/videos/:id'
    );
    expect(await screen.findByText(/sobald die Autoren zugestimmt haben/)).toBeTruthy();
  });
});

describe('Tap-to-gloss', () => {
  it('finds course words without vowels, article or conjunction', () => {
    expect(glossFor('كِتابٌ')?.de).toBe('Buch');
    expect(glossFor('الْكِتابُ')?.de).toBe('Buch');
    expect(glossFor('وَالْكِتابَ')?.de).toBe('Buch');
    expect(glossFor('؟')).toBeNull();
    expect(glossFor('زيوريخ')).toBeNull();
  });

  it('shows the meaning of a tapped word', async () => {
    render(
      <GlossTranscript
        cues={[{ start: 0, end: 4, text: 'هٰذا كِتابٌ جَديد' }]}
        time={1}
        onSeek={() => {}}
      />
    );
    await userEvent.click(screen.getByRole('button', { name: 'كِتابٌ' }));
    expect(screen.getByRole('status').textContent).toContain('Buch');
  });
});

describe('Admin videos tab', () => {
  it('records the permission, starts an import and maps a video to a unit', async () => {
    const { api, requests } = apiWith({
      'GET /api/v1/admin/videos': {
        importEnabled: true,
        channels: [
          {
            id: 'c1',
            name: 'Muhammad al-Andalusi',
            youtubeChannelId: null,
            playlists: ['PLandalusi-book1'],
            permissionStatus: 'unknown',
            permissionNotes: '',
            contactedAt: null,
            lastImportAt: null,
            lastImportError: null,
            videoCount: 1,
          },
        ],
        videos: [
          {
            id: 'v1',
            channelId: 'c1',
            youtubeId: 'aaaaaaaaaa1',
            title: 'مقدمة',
            durationSec: 60,
            unit: null,
            hidden: false,
          },
        ],
      },
    });
    render(
      <RouterProvider
        router={createMemoryRouter([{ path: '/', element: <VideoAdmin api={api} /> }])}
      />
    );
    const card = await screen.findByRole('region', {
      name: 'Kanal Muhammad al-Andalusi',
    });
    await userEvent.selectOptions(
      within(card).getByLabelText('Erlaubnis der Autoren'),
      'requested'
    );
    await userEvent.type(
      within(card).getByLabelText('Notizen zur Anfrage'),
      'E-Mail gesendet'
    );
    await userEvent.click(within(card).getByRole('button', { name: 'Speichern' }));
    expect(requests.find((r) => r.method === 'PATCH')?.body).toEqual({
      permissionStatus: 'requested',
      permissionNotes: 'E-Mail gesendet',
      contactedAt: null,
      playlists: ['PLandalusi-book1'],
    });
    await userEvent.click(
      within(card).getByRole('button', { name: 'Von YouTube importieren' })
    );
    expect(
      requests.some((r) => r.path === '/api/v1/admin/videos/channels/c1/import')
    ).toBe(true);
    await userEvent.click(within(card).getByText('Videos (1)'));
    await userEvent.selectOptions(within(card).getByLabelText('Einheit von مقدمة'), '1');
    expect(requests.find((r) => r.path === '/api/v1/admin/videos/v1')?.body).toEqual({
      unit: 1,
    });
  });
});
