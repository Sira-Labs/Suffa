import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { FocusReview } from '@/modules/review';
import { useSrsStore } from '@/state';

/** Focus mode: a way out, a progress bar and one card at a time. */
describe('Focus review (integration)', () => {
  beforeEach(async () => {
    await useSrsStore.getState().load();
  });

  it('offers a way back, shows progress and asks for the answer', async () => {
    const router = createMemoryRouter([{ path: '/review', element: <FocusReview /> }], {
      initialEntries: ['/review'],
    });
    render(<RouterProvider router={router} />);

    expect(screen.getByRole('link', { name: 'Sitzung beenden' })).toHaveAttribute(
      'href',
      '/'
    );
    expect(await screen.findByRole('heading', { name: 'Wiederholen' })).toHaveClass(
      'visually-hidden'
    );
    expect(
      screen.getByRole('progressbar', { name: 'Fortschritt der Sitzung' })
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Antwort eingeben')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Prüfen' })).toBeInTheDocument();
  });

  it("offers more to practise when nothing is due and today's new words are learned", async () => {
    // Today's five new words are done; nothing else is due yet.
    const store = useSrsStore.getState();
    const fresh = store.getQueue(['vocab_ar_de'], 5, ['vocab_ar_de']).slice(0, 5);
    // Four known at once, one shaky ("hard" keeps it off today's list but makes it wobbly).
    for (const [i, card] of fresh.entries()) {
      await store.review(card, i === 0 ? 'hard' : 'good', 1000);
    }

    const router = createMemoryRouter([{ path: '/review', element: <FocusReview /> }], {
      initialEntries: ['/review'],
    });
    render(<RouterProvider router={router} />);

    expect(await screen.findByText(/Keine fälligen Karten/)).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /Wackelige Wörter üben \(1\)/ })
    ).toHaveAttribute('href', '/review?focus=weak');
    await userEvent.click(screen.getByRole('link', { name: '5 weitere neue Wörter' }));
    expect(router.state.location.search).toBe('?more=1');
    expect(await screen.findByLabelText('Antwort eingeben')).toBeInTheDocument();
  });
});
