import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { UnitPath, UnitStation, Units } from '@/modules/units';
import { FocusReview } from '@/modules/review';
import { db } from '@/services/storage';
import {
  useContentStore,
  useListenStore,
  usePracticeStore,
  useSettingsStore,
  useSrsStore,
} from '@/state';
import { content } from '@/content';
import userEvent from '@testing-library/user-event';
import index from '@/content/sources/book1-audio.json';
import { lessonKey, trackId } from '@/services/audio/publisherIndex';
import type { AudioUnit } from '@/types';

function renderAt(path: string) {
  const router = createMemoryRouter(
    [
      { path: '/units', element: <Units /> },
      { path: '/units/:unit', element: <UnitPath /> },
      { path: '/units/:unit/:station', element: <UnitStation /> },
      { path: '/review', element: <FocusReview /> },
    ],
    { initialEntries: [path] }
  );
  return render(<RouterProvider router={router} />);
}

describe('Units (integration)', () => {
  beforeEach(async () => {
    await db.media_progress.clear();
    await db.practice_progress.clear();
    await usePracticeStore.getState().load();
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
    ).toHaveAttribute('href', '/units/1/listen');
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

  it('practises writing inside the unit and counts it on the path', async () => {
    const user = userEvent.setup();
    const words = content.vokabeln.filter((v) => v.einheit === 1);
    renderAt('/units/1/write');
    expect(await screen.findByRole('heading', { name: 'Schreiben' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Einheit 1' })).toHaveAttribute(
      'href',
      '/units/1'
    );
    // Copying is the first exercise; harakāt are optional, so the bare skeleton counts.
    expect(screen.getByRole('button', { name: 'Abschreiben' })).toHaveAttribute(
      'class',
      expect.stringContaining('btn-accent')
    );
    const bare = words[0]!.ar.replace(/[\u064B-\u0652\u0670]/g, '');
    await user.type(screen.getByRole('textbox'), bare);
    await user.click(screen.getByRole('button', { name: 'Prüfen' }));
    const progress = await screen.findByRole('progressbar', {
      name: 'Fortschritt Schreiben',
    });
    await waitFor(() => expect(progress).toHaveAttribute('aria-valuenow', '1'));
    expect(progress).toHaveAttribute('aria-valuemax', String(words.length));
  });

  it('shows skill rings and the practice stations of the unit', async () => {
    await usePracticeStore.getState().practise(1, 'read', 'd-1-1', ['d-1-1']);
    renderAt('/units/1');
    const rings = await screen.findByRole('list', {
      name: 'Fertigkeiten in dieser Einheit',
    });
    expect(
      within(rings).getByRole('link', { name: /^Schreiben: 0 von \d+$/ })
    ).toHaveAttribute('href', '/units/1/write');
    const path = screen.getByRole('list', { name: 'Lernpfad Einheit 1' });
    expect(within(path).getByRole('link', { name: /Sprechen/ })).toHaveAttribute(
      'href',
      '/units/1/speak'
    );
  });
});
