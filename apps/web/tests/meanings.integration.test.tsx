/**
 * Story 16.4: the learner picks the language of meanings. Reviews ask and grade in it; a word
 * without a reviewed English gloss shows the German one with a "not yet translated" badge.
 * Story 18.4: Turkish, Italian, Bosnian and Albanian are offered once words have reviewed
 * meanings in them, and reviews ask and grade in them too.
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
    for (const v of words()) {
      delete v.en;
      delete v.bedeutungen;
    }
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

  const settingsPage = () =>
    render(
      <MemoryRouter>
        <Settings />
      </MemoryRouter>
    );
  const languageSelect = () =>
    screen.getByRole('combobox', { name: /Sprache der Bedeutungen/ });
  const offered = () =>
    [...languageSelect().querySelectorAll('option')].map((option) => option.value);

  it('offers a further language only once words have reviewed meanings in it (18.4)', async () => {
    const first = settingsPage();
    expect(offered()).toEqual(['', 'de', 'en']);
    first.unmount();

    content.vokabeln[0]!.bedeutungen = { tr: 'merhaba' };
    settingsPage();
    expect(offered()).toEqual(['', 'de', 'en', 'tr']);
    expect(screen.getByRole('option', { name: 'Türkçe' })).toHaveAttribute('lang', 'tr');
    expect(screen.queryByText(/bisher nur geprüfte Wortbedeutungen/)).toBeNull();

    await userEvent.selectOptions(languageSelect(), 'tr');
    await waitFor(async () =>
      expect((await settingsRepo.get()).meaningLanguage).toBe('tr')
    );
    // Says what the learner gets: words only so far.
    expect(screen.getByText(/bisher nur geprüfte Wortbedeutungen/)).toBeInTheDocument();
  });

  it('keeps a language chosen elsewhere in the list while its content is not here yet', async () => {
    await useSettingsStore.getState().update({ meaningLanguage: 'sq' });
    settingsPage();
    expect(languageSelect()).toHaveValue('sq');
    expect(offered()).toEqual(['', 'de', 'en', 'sq']);
  });

  it('asks for and grades Turkish meanings, German ones flagged where Turkish is missing', async () => {
    for (const v of words()) v.bedeutungen = { tr: 'öğrenci' };
    await useSettingsStore.getState().update({ meaningLanguage: 'tr' });
    const { unmount } = renderReview();
    // Typed without the Turkish letters: right all the same.
    await userEvent.type(
      await screen.findByLabelText('Antwort eingeben'),
      'ogrenci{enter}'
    );
    expect(await screen.findByText(/Richtig/)).toBeInTheDocument();
    expect(screen.queryByText('noch nicht übersetzt')).not.toBeInTheDocument();
    unmount();

    for (const v of words()) delete v.bedeutungen;
    renderReview();
    await userEvent.type(
      await screen.findByLabelText('Antwort eingeben'),
      'nonsense{enter}'
    );
    expect(await screen.findByText('noch nicht übersetzt')).toBeInTheDocument();
  });
});
