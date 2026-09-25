import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RemindersCard } from '@/modules/settings/RemindersCard';

const prefs = {
  reminderEnabled: false,
  reminderTime: '18:00',
  quietStart: '22:00',
  quietEnd: '07:00',
  weeklyRecap: false,
};

function fakeServer(publicKey: string | null) {
  const saved: unknown[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'PUT') {
        saved.push(JSON.parse(String(init.body)));
        return new Response(null, { status: 204 });
      }
      if (String(input) === '/api/v1/notifications') {
        return Response.json({ publicKey, prefs, devices: 0 });
      }
      return new Response(null, { status: 404 });
    })
  );
  return saved;
}

/** Story 6.3: reminder settings in "Einstellungen". */
describe('Reminders card (integration)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('says so when the server has no push set up', async () => {
    fakeServer(null);
    render(<RemindersCard />);
    expect(await screen.findByText(/noch nicht eingerichtet/)).toBeInTheDocument();
  });

  it('saves quiet hours, and explains when this device cannot receive push', async () => {
    const saved = fakeServer('BPublicKey');
    render(<RemindersCard />);
    const quietFrom = await screen.findByLabelText('Ruhezeit von');
    await userEvent.clear(quietFrom);
    await userEvent.type(quietFrom, '21:30');
    await userEvent.click(screen.getByRole('button', { name: 'Speichern' }));
    expect(await screen.findByText('Gespeichert.')).toBeInTheDocument();
    expect(saved).toEqual([{ ...prefs, quietStart: '21:30' }]);

    // Reminders need push, which jsdom (like a browser tab on iOS) does not have.
    await userEvent.click(screen.getByRole('checkbox', { name: /Tägliche Erinnerung/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Speichern' }));
    expect(
      await screen.findByText(/Home-Bildschirm/, { selector: '.feedback-bad' })
    ).toBeInTheDocument();
    expect(saved).toHaveLength(1);
  });
});
