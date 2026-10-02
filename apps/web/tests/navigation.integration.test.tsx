import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { More, Training } from '@/modules/more';
import {
  isFocusPath,
  isUnderClasses,
  isUnderMore,
  isUnderTraining,
  NAV_ITEMS,
  navItemsFor,
} from '@/navigation';

function renderPage(element: React.ReactElement) {
  const router = createMemoryRouter([{ path: '/', element }]);
  render(<RouterProvider router={router} />);
}

describe('navigation', () => {
  it('puts Heute · Einheit · Klasse · Üben into the phone bar (plus "Mehr")', () => {
    const primary = NAV_ITEMS.filter((i) => i.tier === 'primary').map((i) => i.label);
    expect(primary).toEqual(['Heute', 'Einheit', 'Klasse', 'Üben']);
  });

  it('gives teachers "Klassen" right after "Heute"', () => {
    const primary = (role: string | null) =>
      navItemsFor(role)
        .filter((i) => i.tier === 'primary')
        .map((i) => i.label);
    expect(primary('teacher')).toEqual(['Heute', 'Klassen', 'Einheit', 'Üben']);
    expect(primary('learner')).toEqual(['Heute', 'Einheit', 'Klasse', 'Üben']);
    expect(primary(null)).toEqual(['Heute', 'Einheit', 'Klasse', 'Üben']);
  });

  it('highlights "Training" and "Mehr" on their own pages only', () => {
    expect(isUnderTraining('/training')).toBe(true);
    expect(isUnderTraining('/vocab')).toBe(true);
    expect(isUnderTraining('/roots')).toBe(true);
    expect(isUnderTraining('/units/4')).toBe(false);
    expect(isUnderTraining('/speaking')).toBe(true);
    expect(isUnderMore('/more')).toBe(true);
    expect(isUnderMore('/speaking')).toBe(false);
    expect(isUnderMore('/settings')).toBe(true);
    expect(isUnderMore('/discover')).toBe(true);
    expect(isUnderMore('/badges')).toBe(true);
    expect(isUnderClasses('/classes/abc')).toBe(true);
    expect(isUnderClasses('/join/xyz')).toBe(true);
    expect(isUnderClasses('/classesx')).toBe(false);
    expect(isUnderMore('/vocab')).toBe(false);
    expect(isUnderMore('/')).toBe(false);
    expect(isUnderMore('/speakingx')).toBe(false);
  });

  it('treats review and milestones as focus screens', () => {
    expect(isFocusPath('/review')).toBe(true);
    expect(isFocusPath('/milestone/1')).toBe(true);
    expect(isFocusPath('/reviewer')).toBe(false);
  });

  it('"Üben" links to practice of every kind across all units', () => {
    renderPage(<Training />);
    const list = screen.getByRole('list', { name: 'Trainingsbereiche' });
    expect(
      within(list)
        .getAllByRole('link')
        .map((a) => a.getAttribute('href'))
    ).toEqual([
      '/alphabet',
      '/review',
      '/vocab',
      '/reading',
      '/writing',
      '/speaking',
      '/roots',
      '/conjugation',
      '/exam',
    ]);
  });

  it('"Mehr" groups media, help and the learner\'s own pages', () => {
    renderPage(<More />);
    const links = (name: string) =>
      within(screen.getByRole('list', { name }))
        .getAllByRole('link')
        .map((a) => a.getAttribute('href'));
    expect(links('Medien')).toEqual(['/discover', '/videos', '/library']);
    expect(links('Hilfe')).toEqual(['/tutor']);
    expect(links('Ich')).toEqual(['/progress', '/settings']);
  });
});
