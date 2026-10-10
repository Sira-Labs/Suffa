/** Courses (ADR-0025): the learner chooses the textbook stream the learning path follows. */
import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
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
    // Saving is asynchronous (IndexedDB first, then the store).
    await waitFor(() =>
      expect(useSettingsStore.getState().settings.course).toBe('madinah')
    );
    expect(await db.settings.get('user-settings')).toMatchObject({ course: 'madinah' });

    const lessons = await screen.findAllByRole('listitem', { name: /^Lektion \d+$/ });
    expect(lessons).toHaveLength(23);
    // Every lesson has our own content and says what it covers.
    const first = screen.getByRole('listitem', { name: 'Lektion 1' });
    expect(within(first).getByRole('link')).toHaveAttribute('href', '/units/madinah/1');
    // The topic is course content, marked as German.
    expect(within(first).getByRole('link')).toHaveTextContent(
      /Was ist das\? .* · \d+ Wörter/
    );
    expect(within(first).getByText(/^Was ist das\?/)).toHaveAttribute('lang', 'de');
    const seventh = screen.getByRole('listitem', { name: 'Lektion 7' });
    expect(within(seventh).getByRole('link')).toHaveTextContent(/تِلْكَ · \d+ Wörter/);
    // Links open outside the app and name the source.
    expect(screen.getByRole('link', { name: 'Lösungen (arabisch)' })).toHaveAttribute(
      'rel',
      'noopener noreferrer'
    );
    expect(screen.getByRole('link', { name: 'Vokabelliste' })).toHaveAttribute(
      'href',
      expect.stringContaining('archive.org')
    );
    expect(screen.getByText(/persönlichen Nutzung/)).toBeTruthy();
    expect(screen.queryByRole('list', { name: 'Etappe 1: Einheiten' })).toBeNull();

    await userEvent.click(
      within(course).getByRole('button', { name: 'Al-Arabiyya bayna Yadayk' })
    );
    expect(await screen.findByRole('list', { name: 'Etappe 1: Einheiten' })).toBeTruthy();
  });
});
