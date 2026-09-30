/** Root families and the pattern trainer (design step 5). */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { PatternTrainer, RootExplorer } from '@/modules/roots';
import { useEnrollmentStore, useSettingsStore } from '@/state';

vi.mock('@/services/speech', () => ({ speakArabic: vi.fn() }));

function renderAt(path: string) {
  const router = createMemoryRouter(
    [
      { path: '/roots', element: <RootExplorer /> },
      { path: '/roots/muster', element: <PatternTrainer /> },
    ],
    { initialEntries: [path] }
  );
  return render(<RouterProvider router={router} />);
}

describe('Root families (integration)', () => {
  beforeEach(async () => {
    await useSettingsStore.getState().load();
    await useEnrollmentStore.getState().load();
  });

  it('shows a root with its words around it, learned ones solid and the rest dashed', async () => {
    const user = userEvent.setup();
    renderAt('/roots');
    await user.type(screen.getByRole('searchbox'), 'درس');
    await user.click(screen.getByRole('button', { name: 'د ر س' }));
    const wheel = screen.getByRole('group', { name: 'Wurzel د ر س' });
    // Unit 1 is reached: its word is learned, words of later units and our own are not.
    const teacher = within(wheel).getByRole('button', { name: 'مُدَرِّس: Lehrer' });
    expect(teacher).not.toHaveClass('unlearned');
    expect(teacher).toHaveAttribute('aria-pressed', 'true');
    expect(
      within(wheel).getByRole('button', {
        name: 'مَدْرَسَة: Schule (noch nicht gelernt)',
      })
    ).toHaveClass('unlearned');
    expect(
      within(wheel).getByRole('button', { name: 'دارِس: Lernender (noch nicht gelernt)' })
    ).toHaveClass('unlearned');
  });

  it('explains the chosen word: root letters coloured, its pattern and more of it', async () => {
    const user = userEvent.setup();
    renderAt('/roots');
    await user.type(screen.getByRole('searchbox'), 'درس');
    await user.click(screen.getByRole('button', { name: 'د ر س' }));
    await user.click(
      screen.getByRole('button', { name: 'مَدْرَسَة: Schule (noch nicht gelernt)' })
    );
    const card = screen.getByRole('region', { name: 'Gewähltes Wort' });
    expect(within(card).getByText('Kommt in Einheit 4.')).toBeTruthy();
    expect(
      within(card).getByText('Ort, an dem etwas geschieht oder gesammelt ist')
    ).toBeTruthy();
    const coloured = card.querySelectorAll('.root-letter');
    expect([...coloured].map((e) => e.textContent)).toContain('دْرَسَ');
    // Another word of the same pattern from a root the learner has met.
    expect(within(card).getByText(/Genauso:/)).toBeTruthy();
  });

  it('finds roots by German meaning and says when there is none', async () => {
    const user = userEvent.setup();
    renderAt('/roots');
    await user.type(screen.getByRole('searchbox'), 'Lehrer');
    expect(screen.getByRole('button', { name: 'د ر س' })).toBeTruthy();
    await user.clear(screen.getByRole('searchbox'));
    await user.type(screen.getByRole('searchbox'), 'xyz');
    expect(screen.getByText('Keine Wurzel gefunden.')).toBeTruthy();
  });

  it('links to the pattern trainer', async () => {
    renderAt('/roots');
    expect(
      screen.getByRole('link', { name: 'Muster-Trainer: Wörter selbst bilden' })
    ).toHaveAttribute('href', '/roots/muster');
  });
});

describe('Pattern trainer (integration)', () => {
  beforeEach(async () => {
    await useSettingsStore.getState().load();
    await useEnrollmentStore.getState().load();
  });

  it('asks for the word of a root and a pattern, shows the answer and counts', async () => {
    const user = userEvent.setup();
    renderAt('/roots/muster');
    const task = screen.getByRole('region', { name: 'Aufgabe' });
    const options = within(task).getAllByRole('button');
    expect(options.length).toBeGreaterThanOrEqual(2);
    await user.click(options[0]!);
    const status = within(task).getByRole('status');
    expect(within(status).getByText(/Richtig!|Nicht ganz\./)).toBeTruthy();
    // The right option is marked, all are locked.
    expect(task.querySelectorAll('.pattern-option.right')).toHaveLength(1);
    expect(options.every((o) => (o as HTMLButtonElement).disabled)).toBe(true);
    expect(within(task).getByText(/von 1 richtig/)).toBeTruthy();
    await user.click(within(status).getByRole('button', { name: 'Nächstes Wort' }));
    expect(
      within(screen.getByRole('region', { name: 'Aufgabe' })).queryByRole('status')
    ).toBeNull();
  });
});
