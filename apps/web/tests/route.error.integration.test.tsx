import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { RouteError } from '@/components';
import * as tracking from '@/services/errorTracking';

/** Ein Render-Fehler einer Seite zeigt eine deutsche Fehlerseite und wird gemeldet. */
afterEach(() => vi.restoreAllMocks());

function Broken(): never {
  throw new Error('Seite kaputt');
}

describe('RouteError (Integration)', () => {
  it('fängt Render-Fehler ab, meldet sie und bietet Neuladen an', async () => {
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
      expect.objectContaining({ message: 'Seite kaputt' }),
      { source: 'router' }
    );
  });

  it('meldet unbekannte Adressen nicht als Fehler', async () => {
    const report = vi.spyOn(tracking, 'reportError').mockImplementation(() => undefined);
    const router = createMemoryRouter(
      [{ path: '/', element: <p>Start</p>, errorElement: <RouteError /> }],
      { initialEntries: ['/gibt-es-nicht'] }
    );
    render(<RouterProvider router={router} />);

    expect(await screen.findByRole('heading')).toHaveTextContent('Seite nicht gefunden');
    expect(report).not.toHaveBeenCalled();
  });
});
