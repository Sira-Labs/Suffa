import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
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
