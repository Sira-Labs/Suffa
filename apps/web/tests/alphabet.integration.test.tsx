import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { Alphabet, AlphabetLessonPage } from '@/modules/alphabet';
import { ALPHABET_LESSONS, lessonItems, parseItem } from '@/services/alphabet';
import { db } from '@/services/storage';
import { useCelebrationStore, usePracticeStore } from '@/state';

function renderAt(path: string) {
  const router = createMemoryRouter(
    [
      { path: '/alphabet', element: <Alphabet /> },
      { path: '/alphabet/:lesson', element: <AlphabetLessonPage /> },
    ],
    { initialEntries: [path] }
  );
  return render(<RouterProvider router={router} />);
}

describe('Alphabet course (integration)', () => {
  beforeEach(async () => {
    await db.practice_progress.clear();
    await usePracticeStore.getState().load();
    useCelebrationStore.getState().dismiss();
  });

  it('lists eight lessons with their progress', () => {
    renderAt('/alphabet');
    const list = screen.getByRole('list', { name: 'Lektionen' });
    expect(within(list).getAllByRole('link')).toHaveLength(8);
    expect(within(list).getAllByText(/^0 von \d+ Aufgaben$/)).toHaveLength(8);
  });

  it('shows the forms of a letter and counts a recognised letter', async () => {
    const user = userEvent.setup();
    renderAt('/alphabet/1');
    const letters = screen.getByRole('group', { name: 'Buchstaben' });
    await user.click(within(letters).getByRole('button', { name: 'Bāʾ' }));
    const forms = screen.getByRole('list', { name: 'Formen' });
    expect(within(forms).getByText('ـبـ')).toBeInTheDocument();

    const lesson = ALPHABET_LESSONS[0]!;
    const first = parseItem(lessonItems(lesson)[0]!)!;
    const choices = screen.getByRole('group', { name: 'Auswahl' });
    await user.click(within(choices).getByRole('button', { name: first.letter.name }));
    const progress = screen.getByRole('progressbar', { name: 'Fortschritt Lektion 1' });
    await waitFor(() => expect(progress).toHaveAttribute('aria-valuenow', '1'));
    expect(useCelebrationStore.getState().current).toMatchObject({
      title: 'Richtig',
      xp: 2,
    });
  });
});
