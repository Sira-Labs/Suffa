/**
 * Story 16.3: the learner switches the interface to English in the settings. The page, the
 * navigation and shared parts follow at once; the choice is stored with the synced settings
 * and on the device, so the next start opens in English.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import i18n, { initUiLanguage, setUiLanguage, storedUiLanguage } from '@/i18n';
import { Settings } from '@/modules/settings/Settings';
import { More } from '@/modules/more';
import { RatingButtons } from '@/components/RatingButtons';
import { createCard } from '@/services/srs';
import { db, settingsRepo } from '@/services/storage';
import { useSettingsStore } from '@/state';

describe('interface language (integration)', () => {
  beforeEach(async () => {
    localStorage.clear();
    await setUiLanguage('de');
    await db.settings.clear();
    await useSettingsStore.getState().load();
  });

  afterEach(async () => {
    await act(() => setUiLanguage('de'));
    localStorage.clear();
  });

  it('switches the settings page to English and stores the choice', async () => {
    render(
      <MemoryRouter>
        <Settings />
      </MemoryRouter>
    );
    expect(screen.getByRole('heading', { name: 'Einstellungen' })).toBeInTheDocument();
    const select = screen.getByRole('combobox', { name: /Sprache der Oberfläche/ });
    await userEvent.selectOptions(select, 'en');

    expect(await screen.findByRole('heading', { name: 'Settings' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: /Interface language/ })).toHaveValue(
      'en'
    );
    expect(screen.getByText('Display')).toBeInTheDocument();
    expect(screen.getByRole('option', { name: '5 days' })).toBeInTheDocument();
    await waitFor(() =>
      expect(useSettingsStore.getState().settings.uiLanguage).toBe('en')
    );
    expect((await settingsRepo.get()).uiLanguage).toBe('en');
    expect(storedUiLanguage()).toBe('en');
    expect(document.documentElement.lang).toBe('en');
  });

  it('starts in the language this device used last time', async () => {
    localStorage.setItem('suffa.uiLanguage', 'en');
    await initUiLanguage();
    expect(i18n.language).toBe('en');
    render(
      <MemoryRouter>
        <More />
      </MemoryRouter>
    );
    expect(screen.getByRole('heading', { name: 'More' })).toBeInTheDocument();
    expect(screen.getByText('Discover')).toBeInTheDocument();
    expect(screen.getByText('Selected videos and podcasts')).toBeInTheDocument();
  });

  it('pluralises shared texts per language', async () => {
    const card = {
      ...createCard({ id: 'c', contentRef: 'v', kind: 'vocab_ar_de' }),
      reps: 3,
      interval: 10,
      lastReviewed: new Date().toISOString(),
    };
    const { rerender } = render(<RatingButtons card={card} onRate={() => {}} />);
    expect(
      screen.getByRole('group', { name: 'Wie gut wusstest du es?' })
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Wieder/ })).toBeInTheDocument();
    await act(() => setUiLanguage('en'));
    rerender(<RatingButtons card={card} onRate={() => {}} />);
    expect(
      screen.getByRole('group', { name: 'How well did you know it?' })
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Again/ })).toBeInTheDocument();
    expect(screen.getAllByText(/days|months/).length).toBeGreaterThan(0);
  });

  it('falls back to German for unknown values', async () => {
    await setUiLanguage('fr');
    expect(i18n.language).toBe('de');
    expect(storedUiLanguage()).toBe('de');
  });
});
