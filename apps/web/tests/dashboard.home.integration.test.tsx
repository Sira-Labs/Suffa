import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { Dashboard } from '@/modules/dashboard';
import { FocusReview } from '@/modules/review';
import { db } from '@/services/storage';
import { XP_RULES } from '@/services/engagement/xp';
import { wordOfTheDay } from '@/services/today';
import { content } from '@/content';
import {
  useCelebrationStore,
  useCheckInStore,
  useContentStore,
  useEnrollmentStore,
  useListenStore,
  usePracticeStore,
  useSettingsStore,
  useSrsStore,
} from '@/state';

function renderHome() {
  const router = createMemoryRouter([{ path: '/', element: <Dashboard /> }], {
    initialEntries: ['/'],
  });
  return render(<RouterProvider router={router} />);
}

/** "Heute": the learner's unit first, a daily check-in with XP, and the level. */
describe('Home (integration)', () => {
  beforeAll(() => {
    // jsdom has no ResizeObserver; charts only need the constructor.
    globalThis.ResizeObserver ??= class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  });

  beforeEach(async () => {
    await Promise.all([
      db.review_logs.clear(),
      db.srs_cards.clear(),
      db.daily_checkins.clear(),
      db.unit_enrollments.clear(),
      db.exam_results.clear(),
    ]);
    await useSettingsStore.getState().load();
    await useContentStore.getState().load();
    await useSrsStore.getState().load();
    await useListenStore.getState().load();
    await usePracticeStore.getState().load();
    await useEnrollmentStore.getState().load();
    await useCheckInStore.getState().load();
    useCelebrationStore.getState().dismiss();
  });

  it('shows the unit to continue right away, before anything was started', async () => {
    renderHome();
    const card = await screen.findByRole('region', { name: /Einheit 1/ });
    expect(
      within(card).getByRole('link', { name: /Einheit 1 beginnen/ })
    ).toHaveAttribute('href', '/units/1');
  });

  it('continues a started unit at its next station', async () => {
    await useEnrollmentStore.getState().start(1, 'normal');
    renderHome();
    const card = await screen.findByRole('region', { name: /Einheit 1/ });
    await waitFor(() =>
      expect(within(card).getByText(/als Nächstes: Dialog hören/)).toBeInTheDocument()
    );
    expect(within(card).getByRole('link', { name: /Fortsetzen/ })).toHaveAttribute(
      'href',
      '/units/1/listen?lesson=1&section=1'
    );
    expect(within(card).getByText('noch 14 Tage')).toBeInTheDocument();
  });

  it('gives XP once a day for the check-in with the word of the day', async () => {
    const user = userEvent.setup();
    renderHome();
    const word = wordOfTheDay(content.vokabeln.filter((v) => v.einheit === 1))!;
    expect(await screen.findByText(word.de)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Check-in/ }));
    expect(await screen.findByText('Heute eingecheckt')).toBeInTheDocument();
    expect(useCelebrationStore.getState().current).toMatchObject({
      title: 'Tages-Check-in',
      xp: XP_RULES.dailyCheckIn,
    });
    expect(screen.queryByRole('button', { name: /Check-in/ })).toBeNull();
    const again = await useCheckInStore.getState().checkIn(word.id);
    expect(again).toEqual({ first: false, xp: 0 });
  });

  it('shows the level instead of the mastery bar', async () => {
    renderHome();
    expect(
      await screen.findByRole('progressbar', { name: 'Fortschritt Stufe 1' })
    ).toHaveAttribute('aria-valuenow', '0');
    expect(screen.getByText(/Etappe 1: 0 von 8 Einheiten/)).toBeInTheDocument();
    expect(screen.queryByText('Beherrschung')).toBeNull();
  });

  it('explains the progress tiles and lists words rated "Schwer"', async () => {
    const card = useSrsStore
      .getState()
      .cards.find(
        (c) => c.kind === 'vocab_ar_de' && c.contentRef === content.vokabeln[0]!.id
      )!;
    await useSrsStore.getState().review(card, 'hard', 1000);
    renderHome();
    expect(await screen.findByText('3 Wochen und länger gemerkt')).toBeInTheDocument();
    const weak = screen.getByText('Wackelige Wörter').closest('details')!;
    await waitFor(() =>
      expect(within(weak).getByText(content.vokabeln[0]!.de)).toBeInTheDocument()
    );
    expect(screen.queryByText('Schwierig')).toBeNull();
  });

  it('practises the wobbly words on demand, even when they are not due yet', async () => {
    const user = userEvent.setup();
    const card = useSrsStore
      .getState()
      .cards.find(
        (c) => c.kind === 'vocab_ar_de' && c.contentRef === content.vokabeln[0]!.id
      )!;
    await useSrsStore.getState().review(card, 'hard', 1000);
    const router = createMemoryRouter(
      [
        { path: '/', element: <Dashboard /> },
        { path: '/review', element: <FocusReview /> },
      ],
      { initialEntries: ['/'] }
    );
    render(<RouterProvider router={router} />);
    await user.click(await screen.findByText('Wackelige Wörter'));
    await user.click(screen.getByRole('link', { name: 'Jetzt gezielt üben' }));
    expect(
      await screen.findByRole('heading', { name: 'Wackelige Wörter' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('progressbar', { name: 'Fortschritt der Sitzung' })
    ).toHaveAttribute('aria-valuemax', '1');
  });
});
