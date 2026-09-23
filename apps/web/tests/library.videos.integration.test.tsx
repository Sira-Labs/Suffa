import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { Library } from '@/modules/library';
import videoIndex from '@/content/sources/book1-videos.json';
import pages from '@/content/sources/book1-pages.json';

function renderAt(path: string) {
  const router = createMemoryRouter([{ path: '/library', element: <Library /> }], {
    initialEntries: [path],
  });
  return render(<RouterProvider router={router} />);
}

/** The publisher's page videos: by unit and book page, embedded only after "play". */
describe('Book page videos (integration)', () => {
  it('ships Book 1 page videos and start pages for all 16 units', () => {
    expect(videoIndex.videos.length).toBeGreaterThan(150);
    expect(videoIndex.videos.every((v) => /^[\w-]{11}$/.test(v.id))).toBe(true);
    expect(Object.keys(pages.unitStartPages)).toHaveLength(16);
    const starts = Object.values(pages.unitStartPages);
    expect([...starts].sort((a, b) => a - b)).toEqual(starts);
  });

  it('shows the page videos of the unit and loads YouTube only on play', async () => {
    const user = userEvent.setup();
    renderAt('/library?unit=2&section=videos');
    const section = screen.getByRole('region', { name: /Buchseiten-Videos · Einheit 2/ });
    const chips = await within(section).findByRole('group', { name: 'Buchseite wählen' });
    const first = within(chips).getAllByRole('button')[0]!;
    expect(first).toHaveAccessibleName('Video zu Buchseite 28');
    expect(first).toHaveAttribute('aria-pressed', 'true');
    expect(section.querySelector('iframe')).toBeNull();

    await user.click(
      within(chips).getByRole('button', { name: 'Video zu Buchseite 31' })
    );
    await user.click(
      within(section).getByRole('button', { name: 'Video zu Buchseite 31 abspielen' })
    );
    const frame = within(section).getByTitle('Video zu Buchseite 31');
    expect(frame.getAttribute('src')).toMatch(
      /^https:\/\/www\.youtube-nocookie\.com\/embed\/[\w-]{11}\?rel=0&autoplay=1$/
    );
  });

  it('keeps videos and audio on the same unit', async () => {
    const user = userEvent.setup();
    renderAt('/library?unit=1');
    await screen.findByRole('heading', { name: 'Einheit 1' });
    await user.click(screen.getByRole('button', { name: 'Nächste Einheit' }));
    expect(
      screen.getByRole('heading', { name: 'Buchseiten-Videos · Einheit 2' })
    ).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'Einheit 2' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^Einheit 6, / }));
    expect(
      await screen.findByText(/Für Einheit 6 gibt es beim Verlag keine Seitenvideos/)
    ).toBeInTheDocument();
  });
});
