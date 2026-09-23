import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
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
});
