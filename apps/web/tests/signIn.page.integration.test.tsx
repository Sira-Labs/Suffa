import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { SignIn } from '@/modules/account';
import { setSignInSkipped, signInSkipped } from '@/services/signInGate';
import { useSyncStore } from '@/state';

function renderAt(url: string) {
  const router = createMemoryRouter(
    [
      { path: '/login', element: <SignIn /> },
      { path: '*', element: <p>App-Seite</p> },
    ],
    { initialEntries: [url] }
  );
  render(<RouterProvider router={router} />);
  return router;
}

/** The sign-in page that comes first for learners who are not signed in. */
describe('Sign-in page (integration)', () => {
  afterEach(() => {
    setSignInSkipped(false);
    vi.restoreAllMocks();
  });

  it('sends the link back to the wanted page and says where to look', async () => {
    const signIn = vi.fn(async () => ({ ok: true }));
    useSyncStore.setState({ signIn });
    renderAt('/login?next=%2Fclasses');
    expect(
      screen.getByRole('heading', { name: 'Bei Suffa anmelden' })
    ).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText('E-Mail-Adresse'), 'amina@example.org');
    await userEvent.click(screen.getByRole('button', { name: 'Link senden' }));
    expect(signIn).toHaveBeenCalledWith('amina@example.org', '/classes?angemeldet=1');
    expect(await screen.findByText(/Link gesendet an amina@example.org/)).toBeVisible();

    await userEvent.click(screen.getByRole('button', { name: 'Nochmal senden' }));
    expect(signIn).toHaveBeenCalledTimes(2);
    await userEvent.click(screen.getByRole('button', { name: 'Andere E-Mail-Adresse' }));
    expect(screen.getByLabelText('E-Mail-Adresse')).toBeVisible();
  });

  it('shows why sending failed', async () => {
    useSyncStore.setState({
      signIn: async () => ({ ok: false, message: 'Zu viele Anfragen' }),
    });
    renderAt('/login');
    await userEvent.type(screen.getByLabelText('E-Mail-Adresse'), 'a@example.org');
    await userEvent.click(screen.getByRole('button', { name: 'Link senden' }));
    expect(await screen.findByText('Zu viele Anfragen')).toBeVisible();
  });

  it('explains an expired link', () => {
    renderAt('/login?error=EXPIRED_TOKEN');
    expect(screen.getByText(/abgelaufen oder wurde schon benutzt/)).toBeVisible();
  });

  it('lets the learner go on without an account and remembers it', async () => {
    const router = renderAt('/login?next=%2Fvocab');
    await userEvent.click(screen.getByRole('button', { name: /Ohne Konto weiter/ }));
    expect(await screen.findByText('App-Seite')).toBeVisible();
    expect(router.state.location.pathname).toBe('/vocab');
    expect(signInSkipped()).toBe(true);
  });
});
