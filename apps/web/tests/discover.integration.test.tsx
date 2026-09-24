import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type { DiscoverCatalog } from '@/types';
import { db } from '@/services/storage';
import { useListenStore } from '@/state';

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
    {
      handle: '@quran',
      channelId: 'UC2',
      title: 'Qurankanal',
      url: 'https://www.youtube.com/@quran',
      category: 'quran',
      language: 'Englisch',
      variety: 'Quran',
      level: '1',
      why: 'Tajwid',
      items: [
        {
          type: 'playlist',
          id: 'PLquran',
          title: 'Tajwid-Reihe',
          why: 'Aussprache',
          minutes: null,
        },
      ],
    },
    {
      handle: '@adv',
      channelId: 'UC3',
      title: 'Fortgeschritten',
      url: 'https://www.youtube.com/@adv',
      category: 'podcasts',
      language: 'Arabisch',
      variety: 'MSA',
      level: '3',
      why: 'Später',
      items: [
        {
          type: 'video',
          id: 'vid00000003',
          title: 'Langer Podcast',
          why: 'Später',
          minutes: 40,
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

function renderDiscover() {
  return render(
    <MemoryRouter>
      <Discover />
    </MemoryRouter>
  );
}

/** Step 4: the curated media library. */
describe('Entdecken (integration)', () => {
  beforeEach(async () => {
    await db.media_progress.clear();
    await useListenStore.getState().load();
  });

  it('shows items for the learner level and filters by category', async () => {
    const user = userEvent.setup();
    renderDiscover();
    const list = await screen.findByRole('list', { name: 'Empfehlungen' });
    expect(within(list).getByText('Das Alphabet')).toBeInTheDocument();
    expect(within(list).getByText('Tajwid-Reihe')).toBeInTheDocument();
    expect(within(list).queryByText('Langer Podcast')).toBeNull();
    expect(screen.getByText('Empfehlung der Woche')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Podcasts' }));
    expect(screen.getByText('Langer Podcast')).toBeInTheDocument();
    expect(screen.queryByText('Das Alphabet')).toBeNull();
  });

  it('plays inline without cookies only after a tap', async () => {
    const user = userEvent.setup();
    renderDiscover();
    await screen.findByRole('list', { name: 'Empfehlungen' });
    expect(document.querySelector('iframe')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Tajwid-Reihe abspielen' }));
    expect(screen.getByTitle('Tajwid-Reihe').getAttribute('src')).toBe(
      'https://www.youtube-nocookie.com/embed/videoseries?list=PLquran&rel=0&autoplay=1'
    );
  });

  it('marks a video as seen once', async () => {
    const user = userEvent.setup();
    renderDiscover();
    await screen.findByRole('list', { name: 'Empfehlungen' });
    const card = screen.getByText('Das Alphabet').closest('li')!;
    await user.click(within(card).getByRole('button', { name: 'Als gesehen markieren' }));
    expect(await within(card).findByText('Gesehen')).toBeInTheDocument();
    expect(useListenStore.getState().progress['yt/vid00000001']).toMatchObject({
      source: 'discover-video',
    });
  });
});
