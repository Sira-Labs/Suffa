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
});
