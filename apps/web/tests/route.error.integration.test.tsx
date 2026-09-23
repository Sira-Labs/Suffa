import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { RouteError } from '@/components';
import * as tracking from '@/services/errorTracking';

/** A page render error shows a German error page and is reported. */
afterEach(() => vi.restoreAllMocks());

function Broken(): never {
  throw new Error('Page broken');
}

describe('RouteError (Integration)', () => {
  it('catches render errors, reports them and offers a reload', async () => {
    const report = vi.spyOn(tracking, 'reportError').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const router = createMemoryRouter(
      [{ path: '/', element: <Broken />, errorElement: <RouteError /> }],
      { initialEntries: ['/'] }
    );
    render(<RouterProvider router={router} />);

    expect(await screen.findByRole('heading')).toHaveTextContent(
      'Da ist etwas schiefgelaufen'
    );
    expect(screen.getByRole('button', { name: 'Neu laden' })).toBeInTheDocument();
    expect(report).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Page broken' }),
      { source: 'router' }
    );
  });

  it('does not report unknown addresses as errors', async () => {
    const report = vi.spyOn(tracking, 'reportError').mockImplementation(() => undefined);
    const router = createMemoryRouter(
      [{ path: '/', element: <p>Start</p>, errorElement: <RouteError /> }],
      { initialEntries: ['/does-not-exist'] }
    );
    render(<RouterProvider router={router} />);

    expect(await screen.findByRole('heading')).toHaveTextContent('Seite nicht gefunden');
    expect(report).not.toHaveBeenCalled();
  });
});
