import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { UnitPath, Units } from '@/modules/units';
import { FocusReview } from '@/modules/review';
import { db } from '@/services/storage';
import { useContentStore, useListenStore, useSettingsStore, useSrsStore } from '@/state';
import index from '@/content/sources/book1-audio.json';
import { lessonKey, trackId } from '@/services/audio/publisherIndex';
import type { AudioUnit } from '@/types';

function renderAt(path: string) {
  const router = createMemoryRouter(
    [
      { path: '/units', element: <Units /> },
      { path: '/units/:unit', element: <UnitPath /> },
      { path: '/review', element: <FocusReview /> },
    ],
    { initialEntries: [path] }
  );
  return render(<RouterProvider router={router} />);
}

describe('Units (integration)', () => {
  beforeEach(async () => {
    await db.media_progress.clear();
    await useSettingsStore.getState().load();
    await useContentStore.getState().load();
    await useSrsStore.getState().load();
    await useListenStore.getState().load();
  });

  it('shows all 16 units and continues where the learner is', async () => {
    renderAt('/units');
    const grid = await screen.findByRole('list', { name: 'Alle Einheiten' });
    expect(within(grid).getAllByRole('link')).toHaveLength(16);
    expect(screen.getByRole('link', { name: /Weiter in Einheit 1/ })).toHaveAttribute(
      'href',
      '/units/1'
    );
  });

  it('shows the learning path with heard lessons ticked off', async () => {
    const unit1 = index.units[0] as AudioUnit;
    for (const track of unit1.lessons[0]!.tracks) {
      await useListenStore.getState().record(
        {
          id: trackId(1, track.url),
          url: track.url,
          lessonKey: lessonKey(1, unit1, unit1.lessons[0]!),
          lessonSize: 3,
        },
        60,
        60
      );
    }
    renderAt('/units/1');
    const path = await screen.findByRole('list', { name: 'Lernpfad Einheit 1' });
    const stations = within(path).getAllByRole('link');
    // Page videos load lazily and come first as an optional station.
    expect(
      await within(path).findByRole('link', { name: /Buchseiten-Videos/ })
    ).toHaveAttribute('href', '/library?unit=1&section=videos');
    expect(
      within(path).getByRole('link', { name: /Dialog 1 \(erledigt\)/ })
    ).toBeTruthy();
    expect(
      within(path).getByRole('link', { name: /Dialog 2 \(als Nächstes\)/ })
    ).toBeTruthy();
    expect(stations.length).toBeGreaterThan(5);
    expect(within(path).getByRole('link', { name: /Vokabeln lernen/ })).toHaveAttribute(
      'href',
      '/review?unit=1'
    );
    expect(screen.getByRole('link', { name: 'Einheit 2' })).toHaveAttribute(
      'href',
      '/units/2'
    );
  });

  it('practises only the words of the unit in focus mode', async () => {
    renderAt('/review?unit=2');
    expect(
      await screen.findByRole('heading', { name: 'Einheit 2 · Vokabeln' })
    ).toBeInTheDocument();
    const progress = screen.getByRole('progressbar', { name: 'Fortschritt der Sitzung' });
    // Unit 2 has 3 words → AR→DE and DE→AR cards.
    expect(progress).toHaveAttribute('aria-valuemax', '6');
    expect(screen.getByRole('link', { name: 'Sitzung beenden' })).toHaveAttribute(
      'href',
      '/units/2'
    );
  });
});
