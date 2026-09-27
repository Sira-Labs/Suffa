/** Courses (ADR-0025): the learner chooses the textbook stream the learning path follows. */
import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { Units } from '@/modules/units';
import { db } from '@/services/storage';
import { useContentStore, useSettingsStore, useSrsStore } from '@/state';

function renderUnits() {
  const router = createMemoryRouter([{ path: '/units', element: <Units /> }], {
    initialEntries: ['/units'],
  });
  return render(<RouterProvider router={router} />);
}

describe('Course switch and Medina path', () => {
  beforeEach(async () => {
    await db.settings.clear();
    await useSettingsStore.getState().load();
    await useContentStore.getState().load();
    await useSrsStore.getState().load();
  });

  it('starts in Al-Arabiyya bayna Yadayk and switches to the Medina course', async () => {
    renderUnits();
    const course = await screen.findByRole('group', { name: 'Kurs' });
    expect(
      within(course).getByRole('button', { name: 'Al-Arabiyya bayna Yadayk' })
    ).toHaveAttribute('aria-pressed', 'true');
    expect(await screen.findByRole('list', { name: 'Etappe 1: Einheiten' })).toBeTruthy();

    await userEvent.click(within(course).getByRole('button', { name: 'Medina-Kurs' }));
    expect(useSettingsStore.getState().settings.course).toBe('madinah');
    expect(await db.settings.get('user-settings')).toMatchObject({ course: 'madinah' });

    const lessons = screen.getAllByRole('listitem', { name: /^Lektion \d+$/ });
    expect(lessons).toHaveLength(23);
    const second = screen.getByRole('listitem', { name: 'Lektion 2' });
    expect(
      within(second).getByRole('link', { name: 'Im Buch öffnen (S. 9)' })
    ).toHaveAttribute(
      'href',
      expect.stringMatching(/madina-book-1-arabic-text.*\.pdf#page=9$/)
    );
    expect(within(second).getByLabelText('Aufnahme Lektion 2')).toHaveAttribute(
      'src',
      'https://archive.org/download/MAA_BK1_VAR/MAA_BK1_VAR_L02.mp3'
    );
    // Links open outside the app and name the source.
    expect(screen.getByRole('link', { name: 'Lösungen (arabisch)' })).toHaveAttribute(
      'rel',
      'noopener noreferrer'
    );
    expect(screen.getByText(/persönlichen Nutzung/)).toBeTruthy();
    expect(screen.queryByRole('list', { name: 'Etappe 1: Einheiten' })).toBeNull();

    await userEvent.click(
      within(course).getByRole('button', { name: 'Al-Arabiyya bayna Yadayk' })
    );
    expect(await screen.findByRole('list', { name: 'Etappe 1: Einheiten' })).toBeTruthy();
  });
});
