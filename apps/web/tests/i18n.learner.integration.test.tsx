/**
 * Story 16.3: the learner's core screens in English – "Today", the level map, a unit and the
 * badge gallery – including texts that come from shared course data (quests, stages, badges).
 * The German catalogue entries for that data must match @suffa/engagement, which stays German.
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import {
  ALL_STAGES,
  BADGES,
  QUEST_POOL,
  type CourseId,
  type QuestDef,
} from '@suffa/engagement';
import { setUiLanguage } from '@/i18n';
import { de } from '@/i18n/locales/de';
import { en } from '@/i18n/locales/en';
import { Dashboard } from '@/modules/dashboard';
import { Badges } from '@/modules/engagement/Badges';
import { questTitle } from '@/modules/engagement/labels';
import { UnitPath, Units } from '@/modules/units';
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

function renderAt(path: string) {
  const router = createMemoryRouter(
    [
      { path: '/', element: <Dashboard /> },
      { path: '/units', element: <Units /> },
      { path: '/units/:unit', element: <UnitPath /> },
      { path: '/badges', element: <Badges /> },
    ],
    { initialEntries: [path] }
  );
  return render(<RouterProvider router={router} />);
}

describe('learner screens in English (integration)', () => {
  beforeAll(() => {
    // jsdom has no ResizeObserver; charts only need the constructor.
    globalThis.ResizeObserver ??= class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  });

  beforeEach(async () => {
    localStorage.clear();
    await Promise.all([
      db.review_logs.clear(),
      db.srs_cards.clear(),
      db.daily_checkins.clear(),
      db.unit_enrollments.clear(),
      db.exam_results.clear(),
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
    await act(() => setUiLanguage('en'));
  });

  afterEach(async () => {
    await act(() => setUiLanguage('de'));
    localStorage.clear();
  });

  it('shows "Today" in English and follows a switch back to German', async () => {
    renderAt('/');
    const card = await screen.findByRole('region', { name: /Unit 1/ });
    expect(within(card).getByText('Your unit')).toBeInTheDocument();
    expect(within(card).getByRole('link', { name: /Start unit 1/ })).toHaveAttribute(
      'href',
      '/units/1'
    );
    expect(
      within(card).getByRole('link', { name: 'Learn the alphabet first' })
    ).toBeTruthy();
    const quests = screen.getByRole('region', { name: 'Daily quests' });
    expect(within(quests).getByText(/^0 of 3 · bonus \+\d+ XP$/)).toBeInTheDocument();
    expect(within(quests).getByRole('link', { name: /Keep learning/ })).toBeTruthy();
    const englishTitles = Object.values(en.engagement.quests);
    const titles = within(quests)
      .getAllByRole('progressbar')
      .map((bar) => bar.getAttribute('aria-label'));
    expect(titles.length).toBe(3);
    for (const title of titles) expect(englishTitles).toContain(title);
    expect(screen.getByRole('region', { name: 'Word of the day' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Your badges' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Your progress/ }).textContent).toMatch(
      /Level 1 · \d+ due · \d+ wobbly words?/
    );

    await act(() => setUiLanguage('de'));
    expect(
      await screen.findByRole('region', { name: 'Tagesaufgaben' })
    ).toBeInTheDocument();
    expect(screen.getByText('Deine Einheit')).toBeInTheDocument();
  });

  it('shows the level map with English stage names and states', async () => {
    renderAt('/units');
    expect(
      await screen.findByRole('heading', { name: /^Level 1 ·/ })
    ).toBeInTheDocument();
    expect(screen.getByText('Continue in unit 1')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Stage 1 · Units 1–8' })
    ).toBeInTheDocument();
    const grid = screen.getByRole('list', { name: 'Stage 1: units' });
    expect(within(grid).getByRole('link', { name: /^Unit 2.*locked$/ })).toBeTruthy();
    expect(screen.getByText('Mid-level test')).toBeInTheDocument();
    expect(screen.getByText(/opens after all unit tests \(0 of 8\)/)).toBeInTheDocument();
    expect(screen.getByText('in progress')).toBeInTheDocument();
  });

  it('starts a unit with an English pace picker and countdown', async () => {
    const user = userEvent.setup();
    renderAt('/units/1');
    expect(
      await screen.findByRole('heading', { name: 'Your pace for unit 1' })
    ).toBeInTheDocument();
    expect(screen.getByText('Relaxed')).toBeInTheDocument();
    expect(screen.getByText('about 25 min a day')).toBeInTheDocument();
    expect(screen.getByText('2 weeks')).toBeInTheDocument();
    expect(screen.getByText(/can be extended once/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'All units' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Start unit 1' }));
    expect(await screen.findByText('14 days left')).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Unit 1 progress' })).toBeTruthy();
  });

  it('shows the badge gallery with English meanings and rules', async () => {
    renderAt('/badges');
    expect(await screen.findByRole('heading', { name: 'Badges' })).toBeInTheDocument();
    expect(screen.getByText(/tiers reached$/)).toBeInTheDocument();
    const streak = screen.getByText('al-Mudāwim').closest('li')!;
    expect(within(streak).getByText(/the steadfast/)).toBeInTheDocument();
    expect(within(streak).getByText('Learned 7 days in a row – 0 of 7')).toBeTruthy();
    expect(within(streak).getByRole('list', { name: 'Tiers' }).textContent).toContain(
      'Silver · 30'
    );
    // A stage badge carries a German name in the data and is translated.
    expect(screen.getByText('Cornerstone')).toBeInTheDocument();
  });
});

describe('catalogue entries for shared course data', () => {
  it('match the German texts of @suffa/engagement', () => {
    // Every title, including the titles per course (`<id>@<course>`).
    const titles = Object.values(QUEST_POOL)
      .flat()
      .flatMap((q) => [
        [q.id, q.title],
        ...Object.entries(q.titles ?? {}).map(([course, title]) => [
          `${q.id}@${course}`,
          title,
        ]),
      ]);
    expect(Object.entries(de.engagement.quests).sort()).toEqual(titles.sort());
    expect(Object.keys(de.engagement.badges).sort()).toEqual(
      BADGES.map((b) => b.id).sort()
    );
    for (const badge of BADGES) {
      const entry = de.engagement.badges[badge.id as keyof typeof de.engagement.badges];
      expect(entry.meaning).toBe(badge.meaning);
      expect(entry.rule).toBe(badge.rule.replace('{n}', '{{n}}'));
    }
    for (const stage of ALL_STAGES) {
      const ref = stage.ref as keyof typeof de.units.stageBadges;
      expect(de.units.stageNames[ref]).toBe(stage.name);
      expect(de.units.stageBadges[ref]).toBe(stage.badge);
      if (stage.test !== null) {
        expect(de.units.stageTests[ref as keyof typeof de.units.stageTests]).toBe(
          stage.test
        );
      }
    }
  });

  it("titles a quest for the learner's course in either language", async () => {
    const practice = QUEST_POOL.produce.find((q) => q.id === 'practice-5')!;
    const medina = dailyQuestFor(practice, 'madinah');
    expect(questTitle(medina)).toBe('5 Übungen in deiner Lektion');
    await act(() => setUiLanguage('en'));
    try {
      expect(questTitle(medina)).toBe('5 exercises in your lesson');
      expect(questTitle(practice)).toBe('5 exercises in your unit');
    } finally {
      await act(() => setUiLanguage('de'));
    }
  });
});

/** The quest as `dailyQuests` returns it for a learner of `course`. */
function dailyQuestFor(quest: QuestDef, course: CourseId): QuestDef {
  return { ...quest, title: quest.titles?.[course] ?? quest.title };
}
