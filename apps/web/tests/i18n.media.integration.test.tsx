/**
 * Story 16.3: the media screens in English. Discover and the video lessons show their page
 * texts, filters, plurals and actions in English, while titles and channel data stay as they
 * come from the catalogue; the sources page switches language while it is open.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, MemoryRouter, RouterProvider } from 'react-router-dom';
import type { DiscoverCatalog } from '@/types';
import { setUiLanguage } from '@/i18n';
import { Sources } from '@/modules/sources';
import { VideoLessons } from '@/modules/videos/VideoLessons';
import { db } from '@/services/storage';
import { VideosApi } from '@/services/videos/videosApi';
import { useDiscoverStore, useListenStore } from '@/state';

const catalog: DiscoverCatalog = {
  retrieved: '2026-09-24',
  channels: [
    {
      handle: '@lang',
      channelId: 'UC1',
      title: 'Sprachkanal',
      url: 'https://www.youtube.com/@lang',
      category: 'sprache',
      language: 'Englisch',
      variety: 'MSA',
      level: '1-2',
      why: 'Grundlagen',
      items: [
        {
          type: 'video',
          id: 'vid00000001',
          title: 'Das Alphabet',
          why: 'Buchstaben',
          minutes: 9,
        },
      ],
    },
  ],
};

vi.mock('@/services/discover', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/services/discover')>();
  return { ...original, loadDiscover: () => Promise.resolve(catalog) };
});

const { Discover } = await import('@/modules/discover');

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

function videosApi(videos: unknown[] | null) {
  const fetchImpl = vi.fn(async () =>
    videos ? Response.json({ videos }) : new Response(null, { status: 503 })
  );
  return new VideosApi(fetchImpl as unknown as typeof fetch);
}

function renderVideos(api: VideosApi) {
  const router = createMemoryRouter(
    [{ path: '/videos', element: <VideoLessons api={api} /> }],
    { initialEntries: ['/videos'] }
  );
  return render(<RouterProvider router={router} />);
}

describe('media screens in English (integration)', () => {
  beforeEach(async () => {
    await Promise.all([db.media_progress.clear(), db.discover_progress.clear()]);
    await useListenStore.getState().load();
    await useDiscoverStore.getState().load();
    await act(() => setUiLanguage('en'));
  });

  afterEach(async () => {
    await act(() => setUiLanguage('de'));
    localStorage.clear();
  });

  it('shows Discover in English, with catalogue data unchanged', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <Discover />
      </MemoryRouter>
    );
    const list = await screen.findByRole('list', { name: 'Recommendations' });
    expect(screen.getByRole('heading', { name: 'Discover' })).toBeInTheDocument();
    expect(screen.getByText(/suited to level 1/)).toBeInTheDocument();
    expect(screen.getByText('Pick of the week')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'For you' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Stories' })).toBeInTheDocument();

    const card = within(list).getByText('Das Alphabet').closest('li')!;
    expect(within(card).getByText('9 min')).toBeInTheDocument();
    expect(within(card).getByText('Language · Level 1-2 · MSA')).toBeInTheDocument();
    expect(
      within(card).getByRole('button', { name: 'Play Das Alphabet' })
    ).toBeInTheDocument();
    await user.click(within(card).getByRole('button', { name: 'Mark as watched' }));
    expect(await within(card).findByText('Watched')).toBeInTheDocument();
  });

  it('lists the video lessons in English', async () => {
    useListenStore.setState({
      progress: {
        [`yt/${LESSON.id}`]: {
          id: `yt/${LESSON.id}`,
          completedAt: '2026-09-25T10:00:00Z',
        } as never,
      },
    });
    renderVideos(videosApi([LESSON, { ...LESSON, id: 'b', title: 'Lesson 3', unit: 3 }]));
    expect(await screen.findByText('الدرس ١ – التحية')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Video lessons' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Choose a unit' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'All' })).toBeInTheDocument();
    expect(screen.getByText(/Unit 1 · 10:00 · with questions · ✓ watched/)).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Unit 3' }));
    expect(screen.queryByText('الدرس ١ – التحية')).toBeNull();
  });

  it('says in English when the video lessons cannot be reached', async () => {
    renderVideos(videosApi(null));
    expect(
      await screen.findByText('The video lessons cannot be reached right now (offline?).')
    ).toBeInTheDocument();
  });

  it('switches the sources page while it is open, keeping the links', async () => {
    await act(() => setUiLanguage('de'));
    render(<Sources />);
    expect(screen.getByRole('heading', { name: 'Quellen & Lizenzen' })).toBeTruthy();
    await act(() => setUiLanguage('en'));
    expect(screen.getByRole('heading', { name: 'Sources & licences' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Other sources' })).toBeTruthy();
    expect(screen.getByText(/for personal use only/)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Goodword Books' })).toHaveAttribute(
      'rel',
      'noopener noreferrer'
    );
    expect(screen.getByRole('link', { name: 'CC BY 2.0 FR' })).toBeTruthy();
  });
});
