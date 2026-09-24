import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type { ReviewLog } from '@/types';
import { ForgettingReminder } from '@/modules/dashboard/ForgettingReminder';

const daysAgo = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return { reviewedAt: d.toISOString(), deleted: false } as ReviewLog;
};

function renderWith(logs: ReviewLog[]) {
  return render(
    <MemoryRouter>
      <ForgettingReminder cards={[]} logs={logs} />
    </MemoryRouter>
  );
}

/** The forgetting curve appears only after a break, never as a permanent panel. */
describe('Forgetting reminder (integration)', () => {
  beforeAll(() => {
    // jsdom has no ResizeObserver; the chart container only needs the constructor.
    globalThis.ResizeObserver ??= class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  });
  beforeEach(() => localStorage.clear());

  it('stays hidden while the streak holds or before the first review', () => {
    renderWith([]);
    renderWith([daysAgo(1)]);
    expect(screen.queryByText('Serie unterbrochen')).toBeNull();
  });

  it('shows the estimated loss after a break and leads back to review', async () => {
    renderWith([daysAgo(3)]);
    expect(
      screen.getByRole('heading', { name: '3 Tage ohne Wiederholung' })
    ).toBeInTheDocument();
    expect(screen.getByText(/nach einem Tag ist geschätzt/)).toHaveTextContent('63 %');
    expect(screen.getByRole('link', { name: 'Jetzt wiederholen' })).toHaveAttribute(
      'href',
      '/review'
    );
  });

  it('can be hidden for the rest of the day', async () => {
    const user = userEvent.setup();
    const { unmount } = renderWith([daysAgo(3)]);
    await user.click(screen.getByRole('button', { name: 'Heute ausblenden' }));
    expect(screen.queryByText('Serie unterbrochen')).toBeNull();
    unmount();
    renderWith([daysAgo(3)]);
    expect(screen.queryByText('Serie unterbrochen')).toBeNull();
  });
});
