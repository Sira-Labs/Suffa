import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { More, Training } from '@/modules/more';
import { isFocusPath, isUnderMore, isUnderTraining, NAV_ITEMS } from '@/navigation';

function renderPage(element: React.ReactElement) {
  const router = createMemoryRouter([{ path: '/', element }]);
  render(<RouterProvider router={router} />);
}

describe('navigation', () => {
  it('puts Heute · Einheit · Entdecken · Training into the phone bar (plus "Mehr")', () => {
    const primary = NAV_ITEMS.filter((i) => i.tier === 'primary').map((i) => i.label);
    expect(primary).toEqual(['Heute', 'Einheit', 'Entdecken', 'Training']);
  });

  it('highlights "Training" and "Mehr" on their own pages only', () => {
    expect(isUnderTraining('/training')).toBe(true);
    expect(isUnderTraining('/vocab')).toBe(true);
    expect(isUnderTraining('/roots')).toBe(true);
    expect(isUnderTraining('/units/4')).toBe(false);
    expect(isUnderMore('/more')).toBe(true);
    expect(isUnderMore('/speaking')).toBe(true);
    expect(isUnderMore('/settings')).toBe(true);
    expect(isUnderMore('/vocab')).toBe(false);
    expect(isUnderMore('/')).toBe(false);
    expect(isUnderMore('/speakingx')).toBe(false);
  });

  it('treats review and milestones as focus screens', () => {
    expect(isFocusPath('/review')).toBe(true);
    expect(isFocusPath('/milestone/1')).toBe(true);
    expect(isFocusPath('/reviewer')).toBe(false);
  });

  it('"Training" links to practice across all units', () => {
    renderPage(<Training />);
    const list = screen.getByRole('list', { name: 'Trainingsbereiche' });
    expect(
      within(list)
        .getAllByRole('link')
        .map((a) => a.getAttribute('href'))
    ).toEqual(['/alphabet', '/review', '/vocab', '/roots', '/conjugation', '/exam']);
  });

  it('"Mehr" links to every secondary destination', () => {
    renderPage(<More />);
    const list = screen.getByRole('list', { name: 'Weitere Bereiche' });
    expect(
      within(list)
        .getAllByRole('link')
        .map((a) => a.getAttribute('href'))
    ).toEqual(['/classes', '/library', '/reading', '/writing', '/speaking', '/settings']);
  });
});
