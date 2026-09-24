import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { UnitPath, UnitStation, Units } from '@/modules/units';
import { FocusReview } from '@/modules/review';
import { UNIT_SESSION_WORDS } from '@/modules/review/FocusReview';
import { db } from '@/services/storage';
import {
  useCelebrationStore,
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
import { dialogueSections } from '@/services/practice';
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

  it('shows level 1 as two stages of eight units and continues where the learner is', async () => {
    renderAt('/units');
    const stage1 = await screen.findByRole('list', { name: 'Etappe 1: Einheiten' });
    const stage2 = screen.getByRole('list', { name: 'Etappe 2: Einheiten' });
    expect(within(stage1).getAllByRole('link')).toHaveLength(8);
    expect(within(stage2).getAllByRole('link')).toHaveLength(8);
    expect(
      screen.getByText(/öffnet nach allen Einheitstests \(0 von 8\)/)
    ).toBeInTheDocument();
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
    // Page videos load lazily and come first in dialogue 1 as an optional station.
    expect(
      await within(path).findByRole('link', { name: /Buchseiten-Videos/ })
    ).toHaveAttribute('href', '/units/1/listen?view=videos');
    expect(
      within(path).getByRole('link', { name: /Dialog hören \(erledigt\)/ })
    ).toHaveAttribute('href', '/units/1/listen?lesson=1&section=1');
    expect(
      within(path).getByRole('link', { name: /Dialog lesen \(als Nächstes\)/ })
    ).toHaveAttribute('href', '/units/1/read?section=1');
    expect(within(path).getByRole('link', { name: /Wörter lernen/ })).toHaveAttribute(
      'href',
      '/review?unit=1&section=1'
    );
    expect(screen.getByRole('link', { name: 'Einheit 2' })).toHaveAttribute(
      'href',
      '/units/2'
    );
  });

  it('shows one dialogue at a time and keeps the later ones closed', async () => {
    renderAt('/units/1');
    const path = await screen.findByRole('list', { name: 'Lernpfad Einheit 1' });
    expect(within(path).getByRole('heading', { name: /Dialog 1/ })).toBeInTheDocument();
    expect(within(path).getAllByRole('list', { name: /^Dialog/ })).toHaveLength(1);
    // Later sections show no stations, only that they follow.
    expect(within(path).getByText('Dialog 2')).toBeInTheDocument();
    expect(within(path).getByText('Abschluss')).toBeInTheDocument();
    expect(within(path).getAllByText('folgt danach')).toHaveLength(3);
    const links = within(path)
      .getAllByRole('link')
      .map((a) => a.getAttribute('href'));
    expect(links.some((href) => href?.includes('lesson=2'))).toBe(false);
    expect(links).not.toContain('/exam?unit=1');
  });

  it('opens a section station with only that dialogue and its words', async () => {
    const [first] = dialogueSections(content, 1);
    renderAt('/units/1/write?section=1');
    const progress = await screen.findByRole('progressbar', {
      name: 'Fortschritt Schreiben',
    });
    expect(progress).toHaveAttribute('aria-valuemax', String(first!.writeIds.length));
    expect(screen.getByText('Einheit 1 · Dialog 1')).toBeInTheDocument();
  });

  it('plays only the dialogue lesson of a section, without the page videos', async () => {
    const { container } = renderAt('/units/1/listen?lesson=1&section=1');
    await waitFor(() =>
      expect(container.querySelectorAll('[id^="lesson-"]')).toHaveLength(1)
    );
    expect(container.querySelector('#lesson-1')).not.toBeNull();
    expect(screen.queryByRole('region', { name: 'Buchseiten-Videos' })).toBeNull();
  });

  it('studies only the words of a section in focus mode', async () => {
    const [first] = dialogueSections(content, 1);
    renderAt('/review?unit=1&section=1');
    expect(
      await screen.findByRole('heading', { name: 'Einheit 1 · Dialog 1 · Wörter' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('progressbar', { name: 'Fortschritt der Sitzung' })
    ).toHaveAttribute(
      'aria-valuemax',
      String(Math.min(first!.wordIds.length, UNIT_SESSION_WORDS) * 2)
    );
  });

  it('practises only the words of the unit in focus mode', async () => {
    renderAt('/review?unit=2');
    expect(
      await screen.findByRole('heading', { name: 'Einheit 2 · Vokabeln' })
    ).toBeInTheDocument();
    const progress = screen.getByRole('progressbar', { name: 'Fortschritt der Sitzung' });
    // New words of unit 2 only, at most UNIT_SESSION_WORDS per sitting, AR→DE and DE→AR.
    const unitWords = content.vokabeln.filter((v) => v.einheit === 2).length;
    expect(progress).toHaveAttribute(
      'aria-valuemax',
      String(Math.min(unitWords, UNIT_SESSION_WORDS) * 2)
    );
    expect(screen.getByRole('link', { name: 'Sitzung beenden' })).toHaveAttribute(
      'href',
      '/units/2'
    );
  });

  it('guides writing step by step, never repeats a solved word and keeps the place', async () => {
    const user = userEvent.setup();
    const [first] = dialogueSections(content, 1);
    const words = first!.wordIds.map((id) => content.vokabeln.find((v) => v.id === id)!);
    const bare = (ar: string) => ar.replace(/[\u064B-\u0652\u0670]/g, '');
    renderAt('/units/1/write?section=1');
    expect(await screen.findByRole('heading', { name: 'Schreiben' })).toBeInTheDocument();
    const steps = screen.getByRole('list', { name: 'Schreibübungen' });
    // Copying is the first step; harakāt are optional, so the bare skeleton counts.
    const copy = within(steps).getByRole('button', { name: /^Abschreiben/ });
    expect(copy).toHaveAttribute('aria-pressed', 'true');
    expect(copy).toHaveTextContent(`0/${words.length}`);

    await user.type(screen.getByRole('textbox'), bare(words[0]!.ar));
    await user.click(screen.getByRole('button', { name: 'Prüfen' }));
    const progress = screen.getByRole('progressbar', { name: 'Fortschritt Schreiben' });
    await waitFor(() => expect(progress).toHaveAttribute('aria-valuenow', '1'));
    expect(progress).toHaveAttribute('aria-valuemax', String(first!.writeIds.length));
    expect(copy).toHaveTextContent(`1/${words.length}`);
    // Every first correct answer shows its XP right away.
    expect(useCelebrationStore.getState().current).toMatchObject({
      title: 'Richtig',
      xp: 2,
    });

    // After a correct answer: on to the next open word.
    await user.click(screen.getByRole('button', { name: 'Weiter' }));
    expect(screen.getByText(words[1]!.ar)).toBeInTheDocument();
    expect(
      screen.getByText(new RegExp(`noch ${words.length - 1} offen`))
    ).toBeInTheDocument();

    // Dictation is its own step; coming back continues with the first open word.
    await user.click(within(steps).getByRole('button', { name: /^Diktat/ }));
    expect(screen.getByRole('button', { name: /Vorlesen/ })).toBeInTheDocument();
    await user.click(within(steps).getByRole('button', { name: /^Abschreiben/ }));
    expect(screen.queryByText(words[0]!.ar)).toBeNull();
    expect(screen.getByText(words[1]!.ar)).toBeInTheDocument();
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
    expect(
      within(path).getByRole('link', { name: /Dialog lesen \(erledigt\)/ })
    ).toBeInTheDocument();
    expect(within(path).getByRole('link', { name: /Nachsprechen/ })).toHaveAttribute(
      'href',
      '/units/1/speak?section=1'
    );
  });
});
