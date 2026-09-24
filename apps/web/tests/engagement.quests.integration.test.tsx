import { beforeEach, describe, expect, it } from 'vitest';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { dailyQuests, dayKey } from '@suffa/engagement';
import type { ReviewLog } from '@/types';
import { Dashboard } from '@/modules/dashboard';
import { EngagementWatcher } from '@/modules/engagement/EngagementWatcher';
import { questLink } from '@/modules/engagement/TodayQuests';
import { browserTimeZone } from '@/modules/settings/devices';
import { db } from '@/services/storage';
import {
  useCelebrationStore,
  useCheckInStore,
  useContentStore,
  useEngagementStore,
  useEnrollmentStore,
  useListenStore,
  usePracticeStore,
  useSettingsStore,
  useSrsStore,
} from '@/state';

function goodReviews(n: number, at: Date): ReviewLog[] {
  return Array.from({ length: n }, (_, i) => {
    const reviewedAt = new Date(at.getTime() + i * 1000).toISOString();
    return {
      id: `log-${i}`,
      cardId: `card-${i}`,
      contentRef: `v${i}`,
      kind: 'vocab_ar_de',
      rating: 'good',
      durationMs: 4000,
      scheduledInterval: 1,
      reviewedAt,
      updated_at: reviewedAt,
      deleted: false,
    };
  });
}

function renderHome() {
  const router = createMemoryRouter(
    [
      {
        path: '/',
        element: (
          <>
            <EngagementWatcher />
            <Dashboard />
          </>
        ),
      },
    ],
    { initialEntries: ['/'] }
  );
  return render(<RouterProvider router={router} />);
}

/** Story 5.2: the day's three quests on "Heute", offline, with a toast when one is done. */
describe('Daily quests (integration)', () => {
  beforeEach(async () => {
    await Promise.all([
      db.review_logs.clear(),
      db.srs_cards.clear(),
      db.daily_checkins.clear(),
      db.practice_progress.clear(),
    ]);
    await useSettingsStore.getState().load();
    await useContentStore.getState().load();
    await useSrsStore.getState().load();
    await useListenStore.getState().load();
    await usePracticeStore.getState().load();
    await useEnrollmentStore.getState().load();
    await useCheckInStore.getState().load();
    await useEngagementStore.getState().refresh();
    useCelebrationStore.getState().dismiss();
  });

  it('shows the quests of the day and counts reviews done today', async () => {
    const today = dayKey(new Date(), browserTimeZone());
    const [reviewQuest] = dailyQuests(today);
    // 25 good first reviews finish any review quest (≤ 20 cards).
    await db.review_logs.bulkAdd(goodReviews(25, new Date(Date.now() - 60 * 60_000)));
    renderHome();
    const card = await screen.findByRole('region', { name: 'Tagesaufgaben' });
    // Logs load after the first render; the quest turns done then.
    await waitFor(() =>
      expect(within(card).getByText(reviewQuest!.title).textContent).toContain('erledigt')
    );
    expect(within(card).getByText(/1 Tag in Folge/)).toBeTruthy();
  });

  it('celebrates a quest the moment it is done', async () => {
    renderHome();
    await screen.findByRole('region', { name: 'Tagesaufgaben' });
    expect(useCelebrationStore.getState().current).toBeNull();
    await act(async () => {
      await db.review_logs.bulkAdd(goodReviews(25, new Date(Date.now() - 60_000)));
      await useEngagementStore.getState().refresh();
    });
    expect(useCelebrationStore.getState().current?.title).toMatch(
      /Tagesaufgabe|Abzeichen/
    );
  });

  it('links every quest to where it is done', () => {
    const [review, learn, produce] = dailyQuests('2026-09-24');
    for (const quest of [review!, learn!, produce!]) {
      expect(questLink(quest, 3)).toMatch(/^\/(review|units\/3)/);
    }
    expect(questLink({ ...learn!, metric: { kind: 'tracks' } }, 3)).toBe(
      '/units/3/listen'
    );
    expect(
      questLink({ ...produce!, metric: { kind: 'practice', skills: ['write'] } }, 3)
    ).toBe('/units/3/write');
    expect(questLink({ ...produce!, metric: { kind: 'practice' } }, 3)).toBe('/units/3');
  });
});
