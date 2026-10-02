/**
 * Badges on "Heute": the medals reached, newest first in their tier, and the badges closest
 * to their next tier with how far there is to go.
 */
import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import type { BadgeProgress } from '@suffa/engagement';
import { HomeBadges, homeBadges } from '@/modules/engagement/HomeBadges';

function badge(
  id: string,
  name: string,
  thresholds: number[],
  count: number,
  unlockedAt: string[] = []
): BadgeProgress {
  const tiers = ['bronze', 'silver', 'gold'] as const;
  const unlocks = unlockedAt.map((at, i) => ({
    badgeId: id,
    tier: tiers[i]!,
    threshold: thresholds[i]!,
    unlockedAt: at,
  }));
  return {
    badge: { id, name, arabic: 'ا', meaning: 'm', rule: '{n} Mal geübt', thresholds },
    count,
    unlocks,
    next: thresholds[unlocks.length] ?? null,
  };
}

const streak = badge('mudawim', 'al-Mudāwim', [7, 30, 100], 9, ['2026-09-20T08:00:00Z']);
const words = badge('talib', 'aṭ-Ṭālib', [50, 200, 500], 180, ['2026-09-10T08:00:00Z']);
const early = badge('fajr', 'al-Fajr', [5], 5, ['2026-09-25T08:00:00Z']);
const fresh = badge('hafiz', 'al-Ḥāfiẓ', [10, 50, 100], 0);

describe('Badges on "Heute"', () => {
  it('lists the newest medals first and the closest next tiers', () => {
    const view = homeBadges([fresh, streak, words, early]);
    expect(view.earned.map((b) => b.badge.id)).toEqual(['fajr', 'mudawim', 'talib']);
    // aṭ-Ṭālib is at 180 of 200 for silver, al-Mudāwim at 9 of 30.
    expect(view.close.map((b) => b.badge.id)).toEqual(['talib', 'mudawim', 'hafiz']);
    expect(view.reached).toBe(3);
    expect(view.possible).toBe(10);
  });

  it('shows the medals with their tier and the way to the next one', () => {
    const router = createMemoryRouter(
      [{ path: '/', element: <HomeBadges badges={[fresh, streak, words, early]} /> }],
      { initialEntries: ['/'] }
    );
    render(<RouterProvider router={router} />);
    const card = screen.getByRole('region', { name: 'Deine Abzeichen' });
    expect(within(card).getByText('3 von 10 Stufen erreicht')).toBeTruthy();
    const medals = within(card).getByRole('list', { name: 'Erreichte Abzeichen' });
    expect(medals.textContent).toContain('al-MudāwimBronze');
    const close = within(card).getByRole('list', { name: 'Fast geschafft' });
    expect(within(close).getByText('aṭ-Ṭālib · Silber')).toBeTruthy();
    expect(within(close).getByText('noch 20')).toBeTruthy();
    expect(
      within(close).getByRole('progressbar', { name: 'aṭ-Ṭālib: Weg zu Silber' })
    ).toHaveAttribute('aria-valuenow', '180');
    expect(within(card).getByRole('link', { name: 'Alle ansehen' })).toHaveAttribute(
      'href',
      '/badges'
    );
  });

  it('points to the first badge when none is reached yet', () => {
    const router = createMemoryRouter(
      [{ path: '/', element: <HomeBadges badges={[fresh]} /> }],
      { initialEntries: ['/'] }
    );
    render(<RouterProvider router={router} />);
    expect(screen.getByText(/Noch kein Abzeichen/)).toBeTruthy();
    expect(screen.getByText('al-Ḥāfiẓ · Bronze')).toBeTruthy();
  });
});
