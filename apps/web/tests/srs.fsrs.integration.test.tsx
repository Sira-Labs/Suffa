import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { Settings } from '@/modules/settings/Settings';
import { createCard } from '@/services/srs';
import { cardRepo, db, settingsRepo } from '@/services/storage';
import { useSettingsStore, useSrsStore } from '@/state';

/** Story 15.6: the learner switches to FSRS in the settings; reviews follow the choice. */
describe('FSRS switch (integration)', () => {
  beforeEach(async () => {
    await db.settings.clear();
    await db.srs_cards.clear();
    await useSettingsStore.getState().load();
  });

  it('schedules with FSRS once chosen, and switching back keeps the card intact', async () => {
    render(
      <MemoryRouter>
        <Settings />
      </MemoryRouter>
    );
    const select = await screen.findByRole('combobox', { name: /Wiederholungsplan/ });
    expect(select).toHaveValue('sm2');
    await userEvent.selectOptions(select, 'fsrs');
    await waitFor(() =>
      expect(useSettingsStore.getState().settings.srsAlgorithm).toBe('fsrs')
    );
    // The choice is stored (and synced with the settings).
    expect((await settingsRepo.get()).srsAlgorithm).toBe('fsrs');

    const card = createCard({
      id: 'vocab_ar_de:v-kitab',
      contentRef: 'v-kitab',
      kind: 'vocab_ar_de',
    });
    await cardRepo.put(card);
    const reviewed = await useSrsStore.getState().review(card, 'good', 1200);
    expect(reviewed.stability).toBeCloseTo(3.173);
    expect(reviewed.interval).toBe(3);

    await userEvent.selectOptions(select, 'sm2');
    await waitFor(() =>
      expect(useSettingsStore.getState().settings.srsAlgorithm).toBe('sm2')
    );
    const again = await useSrsStore.getState().review(reviewed, 'good', 1200);
    // SM-2 continues from the fields FSRS kept (second success: 6 days) and keeps the FSRS state.
    expect(again).toMatchObject({ reps: 2, interval: 6, stability: reviewed.stability });
  });
});
