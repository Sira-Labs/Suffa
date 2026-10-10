/**
 * Story 16.4: the learner picks the language of meanings. Reviews ask and grade in it; a word
 * without a reviewed English gloss shows the German one with a "not yet translated" badge.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, MemoryRouter, RouterProvider } from 'react-router-dom';
import { content, madinahVokabeln } from '@/content';
import { FocusReview } from '@/modules/review';
import { Settings } from '@/modules/settings/Settings';
import { db, settingsRepo } from '@/services/storage';
import { useSettingsStore, useSrsStore } from '@/state';

function renderReview() {
  const router = createMemoryRouter([{ path: '/review', element: <FocusReview /> }], {
    initialEntries: ['/review'],
  });
  return render(<RouterProvider router={router} />);
}

describe('meaning language (integration)', () => {
  beforeEach(async () => {
    await db.settings.clear();
    await useSettingsStore.getState().load();
    await useSrsStore.getState().load();
  });

  // Both courses' words (the first new card may be a Medina word).
  const words = () => [...content.vokabeln, ...madinahVokabeln];

  afterEach(() => {
    for (const v of words()) delete v.en;
  });

  it('is chosen in the settings and synced with them', async () => {
    render(
      <MemoryRouter>
        <Settings />
      </MemoryRouter>
    );
    const select = screen.getByRole('combobox', { name: /Sprache der Bedeutungen/ });
    expect(select).toHaveValue('');
    await userEvent.selectOptions(select, 'en');
    await waitFor(async () =>
      expect((await settingsRepo.get()).meaningLanguage).toBe('en')
    );
    await userEvent.selectOptions(select, '');
    await waitFor(async () =>
      expect((await settingsRepo.get()).meaningLanguage).toBeNull()
    );
  });

  it('asks for and grades English meanings, German ones flagged where English is missing', async () => {
    for (const v of words()) v.en = `english ${v.id}`;
    await useSettingsStore.getState().update({ meaningLanguage: 'en' });
    const { unmount } = renderReview();
    const input = await screen.findByLabelText('Antwort eingeben');
    // The first card asks Arabic → meaning: a wrong answer shows the English one.
    await userEvent.type(input, 'nonsense{enter}');
    const expected = await screen.findByText(/^english /);
    expect(expected).toHaveAttribute('lang', 'en');
    expect(screen.queryByText('noch nicht übersetzt')).not.toBeInTheDocument();
    unmount();

    // Without English the German gloss stands in, with the badge.
    for (const v of words()) delete v.en;
    renderReview();
    await userEvent.type(
      await screen.findByLabelText('Antwort eingeben'),
      'nonsense{enter}'
    );
    expect(await screen.findByText('noch nicht übersetzt')).toBeInTheDocument();
  });
});
