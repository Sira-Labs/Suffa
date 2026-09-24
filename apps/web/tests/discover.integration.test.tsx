import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type { DiscoverCatalog } from '@/types';
import { db } from '@/services/storage';
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
    await Promise.all([db.media_progress.clear(), db.discover_progress.clear()]);
    await useListenStore.getState().load();
    await useDiscoverStore.getState().load();
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

  it('pins started videos on top, last opened first, until unpinned or seen', async () => {
    const user = userEvent.setup();
    const first = renderDiscover();
    await screen.findByRole('list', { name: 'Empfehlungen' });
    await user.click(screen.getByRole('button', { name: 'Das Alphabet abspielen' }));
    await user.click(screen.getByRole('button', { name: 'Tajwid-Reihe abspielen' }));
    // While playing, a card stays where it was tapped.
    expect(
      within(screen.getByRole('list', { name: 'Empfehlungen' })).getByTitle(
        'Tajwid-Reihe'
      )
    ).toBeInTheDocument();
    first.unmount();

    // Next visit: both on top, the last opened first, marked as started.
    renderDiscover();
    const pinned = await screen.findByRole('list', { name: 'Weiterschauen' });
    expect(
      within(pinned)
        .getAllByRole('listitem')
        .map((li) => li.querySelector('strong')!.textContent)
    ).toEqual(['Tajwid-Reihe', 'Das Alphabet']);
    expect(within(pinned).getAllByText('Angefangen')).toHaveLength(2);
    expect(screen.queryByRole('list', { name: 'Empfehlungen' })).toBeNull();
    expect(screen.getByText(/steht oben unter „Weiterschauen“/)).toBeInTheDocument();

    // Unpin one the learner does not like: it goes back into the list, still "Angefangen".
    await user.click(within(pinned).getByRole('button', { name: 'Tajwid-Reihe lösen' }));
    expect(within(pinned).queryByText('Tajwid-Reihe')).toBeNull();
    const list = screen.getByRole('list', { name: 'Empfehlungen' });
    expect(within(list).getByText('Tajwid-Reihe')).toBeInTheDocument();
    expect(within(list).getByText('Angefangen')).toBeInTheDocument();

    // Seen items leave "Weiterschauen" by themselves.
    await user.click(
      within(pinned).getByRole('button', { name: 'Als gesehen markieren' })
    );
    expect(screen.queryByRole('list', { name: 'Weiterschauen' })).toBeNull();
  });

  it('pins any item by hand', async () => {
    const user = userEvent.setup();
    renderDiscover();
    await screen.findByRole('list', { name: 'Empfehlungen' });
    await user.click(screen.getByRole('button', { name: 'Das Alphabet anheften' }));
    const pinned = await screen.findByRole('list', { name: 'Weiterschauen' });
    expect(within(pinned).getByText('Das Alphabet')).toBeInTheDocument();
    expect(within(pinned).queryByText('Angefangen')).toBeNull();
  });
});
