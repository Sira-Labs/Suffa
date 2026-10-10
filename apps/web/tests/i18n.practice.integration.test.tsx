/**
 * Story 16.3: the practice modules speak English when the learner picks it. Interface texts
 * switch; course content (letter names, German meanings) stays as it is.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { setUiLanguage } from '@/i18n';
import { Alphabet, AlphabetLessonPage } from '@/modules/alphabet';
import { Exam } from '@/modules/exam';
import { Speaking } from '@/modules/speaking';
import { recorderHelp } from '@/modules/speaking/speechHelp';
import { ReviewSession } from '@/modules/vocab';
import {
  ALPHABET_LESSONS,
  lessonItems,
  letterSound,
  parseItem,
} from '@/services/alphabet';
import { db } from '@/services/storage';
import {
  useCelebrationStore,
  useContentStore,
  useEnrollmentStore,
  usePracticeStore,
  useSettingsStore,
  useSrsStore,
} from '@/state';

function renderAt(path: string) {
  const router = createMemoryRouter(
    [
      { path: '/alphabet', element: <Alphabet /> },
      { path: '/alphabet/:lesson', element: <AlphabetLessonPage /> },
      { path: '/exam', element: <Exam /> },
    ],
    { initialEntries: [path] }
  );
  return render(<RouterProvider router={router} />);
}

describe('practice modules in English (integration)', () => {
  beforeEach(async () => {
    await Promise.all([
      db.settings.clear(),
      db.practice_progress.clear(),
      db.exam_results.clear(),
    ]);
    await useSettingsStore.getState().load();
    await usePracticeStore.getState().load();
    await useEnrollmentStore.getState().load();
    useCelebrationStore.getState().dismiss();
    await act(() => setUiLanguage('en'));
  });

  afterEach(async () => {
    await act(() => setUiLanguage('de'));
    localStorage.clear();
  });

  it('shows the alphabet course and a lesson in English', async () => {
    const user = userEvent.setup();
    renderAt('/alphabet');
    expect(screen.getByRole('heading', { name: 'Alphabet' })).toBeInTheDocument();
    const list = screen.getByRole('list', { name: 'Lessons' });
    expect(within(list).getAllByText(/^0 of \d+ tasks$/)).toHaveLength(8);
    expect(within(list).getByText('8. Vowel signs')).toBeInTheDocument();

    await user.click(within(list).getAllByRole('link')[0]!);
    expect(await screen.findByText('Lesson 1')).toBeInTheDocument();
    expect(
      screen.getByText('Same basic shape – only the dots tell them apart.')
    ).toBeInTheDocument();
    expect(screen.getByText('Sound: long a')).toBeInTheDocument();
    const forms = screen.getByRole('list', { name: 'Forms' });
    expect(within(forms).getByText('isolated')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Practise' })).toBeInTheDocument();

    const first = parseItem(lessonItems(ALPHABET_LESSONS[0]!)[0]!)!;
    const choices = screen.getByRole('group', { name: 'Choices' });
    await user.click(within(choices).getByRole('button', { name: first.letter.name }));
    expect(
      screen.getByText(`✓ Correct – ${first.letter.name} (${letterSound(first.letter)})`)
    ).toBeInTheDocument();
    const progress = screen.getByRole('progressbar', { name: 'Progress of lesson 1' });
    await waitFor(() => expect(progress).toHaveAttribute('aria-valuenow', '1'));
    expect(useCelebrationStore.getState().current).toMatchObject({ title: 'Correct' });
  });

  it('switches the speaking page to English, help texts included', async () => {
    const user = userEvent.setup();
    render(<Speaking />);
    expect(
      screen.getByRole('heading', { name: 'Speaking (pushed output)' })
    ).toBeInTheDocument();
    expect(screen.getByText(/^Sentence 1 of \d+$/)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: '← Previous sentence' })
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Phonology drills' }));
    expect(screen.getByRole('button', { name: 'Next pair' })).toBeInTheDocument();
    expect(recorderHelp('denied', { ios: true, standalone: false })).toMatch(
      /^No access to the microphone\. iPhone: Settings → Apps → Safari/
    );
  });

  it('configures a test in English', async () => {
    renderAt('/exam');
    expect(await screen.findByRole('heading', { name: 'Test mode' })).toBeInTheDocument();
    expect(screen.getByText('Formats')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Plural test' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start test' })).toBeInTheDocument();
    expect(screen.getByLabelText('Number of questions:')).toHaveValue(10);
  });

  // Seeding every card from the content takes a few seconds on a busy machine.
  it('shows the review session in English', async () => {
    await db.delete();
    await db.open();
    await useSettingsStore.getState().load();
    await useContentStore.getState().load();
    await useSrsStore.getState().load();
    render(<ReviewSession kinds={['vocab_ar_de']} title="AR → DE" />);
    expect(await screen.findByRole('button', { name: 'Check' })).toBeInTheDocument();
    expect(
      screen.getByRole('progressbar', { name: 'Session progress' })
    ).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Answer…')).toBeInTheDocument();
  }, 20_000);
});
