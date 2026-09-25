import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { DriveImport } from '@/modules/classes/DriveImport';

function renderAt(url: string, status: number, body?: unknown) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      body === undefined
        ? new Response(null, { status })
        : Response.json(body, { status })
    )
  );
  const router = createMemoryRouter(
    [
      {
        path: '/classes/:id',
        element: <DriveImport classId="c1" onImported={() => {}} />,
      },
    ],
    { initialEntries: [url] }
  );
  return render(<RouterProvider router={router} />);
}

/** Story 7.2: the Drive card for teachers. */
describe('Drive import (integration)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('offers to connect and comes back to this class', async () => {
    renderAt('/classes/c1?drive=connected', 200, {
      connected: false,
      apiKey: 'k',
      appId: '1',
    });
    const link = await screen.findByRole('link', { name: 'Google Drive verbinden' });
    expect(link).toHaveAttribute(
      'href',
      '/api/v1/drive/connect?returnTo=%2Fclasses%2Fc1'
    );
    expect(screen.getByText('Google Drive ist verbunden.')).toBeInTheDocument();
  });

  it('shows the picker button once connected, nothing when Drive is off', async () => {
    const { unmount } = renderAt('/classes/c1', 200, {
      connected: true,
      apiKey: 'k',
      appId: '1',
    });
    expect(
      await screen.findByRole('button', { name: 'Aufnahmen auswählen' })
    ).toBeInTheDocument();
    unmount();
    const { container } = renderAt('/classes/c1', 404);
    await new Promise((r) => setTimeout(r, 20));
    expect(container.textContent).toBe('');
  });
});
