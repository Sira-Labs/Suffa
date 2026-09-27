import { afterEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type { PathSection, SectionState } from '@/services/units';
import { SectionCelebration } from './SectionCelebration';

const section = (no: number, state: SectionState): PathSection => ({
  id: `s${no}`,
  no,
  label: `Dialog ${no}`,
  title: null,
  state,
  stations: [
    {
      id: `s${no}-read`,
      kind: 'read',
      label: 'Dialog lesen',
      detail: '',
      to: `/units/1/read?section=${no}`,
      done: 0,
      total: 1,
      state: state === 'current' ? 'current' : 'upcoming',
    },
  ],
});

const show = (sections: PathSection[]) =>
  render(
    <MemoryRouter>
      <SectionCelebration unit={1} sections={sections} />
    </MemoryRouter>
  );

describe('SectionCelebration', () => {
  afterEach(() => localStorage.clear());

  it('stays quiet on the first visit, then celebrates a newly finished dialogue', async () => {
    const first = show([section(1, 'current'), section(2, 'locked')]);
    expect(screen.queryByRole('dialog')).toBeNull();
    first.unmount();

    show([section(1, 'done'), section(2, 'current')]);
    expect(screen.getByRole('dialog', { name: 'Dialog 1 geschafft' })).toBeTruthy();
    expect(screen.getByText('Mā shāʾ Allāh!')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Weiter mit Dialog 2' })).toHaveAttribute(
      'href',
      '/units/1/read?section=2'
    );
    await userEvent.click(screen.getByRole('button', { name: 'Zum Lernpfad' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('does not celebrate the same dialogue twice', () => {
    localStorage.setItem('suffa.path.celebrated.1', '[1]');
    show([section(1, 'done'), section(2, 'current')]);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('shows every newly finished dialogue in turn, and Escape closes one', async () => {
    localStorage.setItem('suffa.path.celebrated.1', '[]');
    show([section(1, 'done'), section(2, 'done'), section(3, 'current')]);
    expect(screen.getByRole('dialog', { name: 'Dialog 1 geschafft' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Weiter mit Dialog 3' })).toHaveFocus();
    await userEvent.keyboard('{Escape}');
    expect(screen.getByRole('dialog', { name: 'Dialog 2 geschafft' })).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Zum Lernpfad' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('keeps dialogues celebrated even when they fall back to open', () => {
    localStorage.setItem('suffa.path.celebrated.1', '[1]');
    const view = show([section(1, 'current'), section(2, 'locked')]);
    view.unmount();
    expect(JSON.parse(localStorage.getItem('suffa.path.celebrated.1')!)).toEqual([1]);
    show([section(1, 'done'), section(2, 'current')]);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('still celebrates the second dialogue after leaving during the first', () => {
    localStorage.setItem('suffa.path.celebrated.1', '[]');
    const both = [section(1, 'done'), section(2, 'done'), section(3, 'current')];
    const view = show(both);
    expect(screen.getByRole('dialog', { name: 'Dialog 1 geschafft' })).toBeTruthy();
    view.unmount();
    show(both);
    expect(screen.getByRole('dialog', { name: 'Dialog 2 geschafft' })).toBeTruthy();
  });
});
