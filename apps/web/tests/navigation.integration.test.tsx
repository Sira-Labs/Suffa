import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { More } from '@/modules/more';
import { isUnderMore, NAV_ITEMS } from '@/navigation';

describe('navigation', () => {
  it('puts exactly four destinations into the phone bar, the rest under "Mehr"', () => {
    const primary = NAV_ITEMS.filter((i) => i.tier === 'primary').map((i) => i.label);
    expect(primary).toEqual(['Heute', 'Lernen', 'Hören', 'Wurzeln']);
    expect(NAV_ITEMS.filter((i) => i.tier === 'secondary')).toHaveLength(6);
  });

  it('marks "Mehr" active on secondary pages only', () => {
    expect(isUnderMore('/more')).toBe(true);
    expect(isUnderMore('/speaking')).toBe(true);
    expect(isUnderMore('/settings')).toBe(true);
    expect(isUnderMore('/')).toBe(false);
    expect(isUnderMore('/vocab')).toBe(false);
    expect(isUnderMore('/speakingx')).toBe(false);
  });

  it('"Mehr" links to every secondary destination', () => {
    const router = createMemoryRouter([{ path: '/', element: <More /> }]);
    render(<RouterProvider router={router} />);
    const list = screen.getByRole('list', { name: 'Weitere Bereiche' });
    const links = within(list).getAllByRole('link');
    expect(links.map((a) => a.getAttribute('href'))).toEqual([
      '/reading',
      '/writing',
      '/speaking',
      '/conjugation',
      '/exam',
      '/settings',
    ]);
    expect(within(list).getByRole('link', { name: /Sprechen/ })).toBeInTheDocument();
  });
});
