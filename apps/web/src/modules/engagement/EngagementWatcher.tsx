import { useEffect, useRef } from 'react';
import { BADGES, QUEST_XP } from '@suffa/engagement';
import { useCelebrationStore, useEngagementStore, useSrsStore } from '@/state';
import { useEngagement } from './useEngagement';

const TIER_LABEL = { bronze: 'Bronze', silver: 'Silber', gold: 'Gold' } as const;

/**
 * Keeps the engagement inputs fresh and celebrates what was just reached: a daily quest, all
 * three (bonus), a new badge tier. What was already reached when the app opened (or arrives
 * with a sync from another device) is not celebrated again.
 */
export function EngagementWatcher() {
  const cards = useSrsStore((s) => s.cards);
  const refresh = useEngagementStore((s) => s.refresh);
  const loadLessonSizes = useEngagementStore((s) => s.loadLessonSizes);
  const celebrate = useCelebrationStore((s) => s.show);
  const summary = useEngagement();
  const seen = useRef<Set<string> | null>(null);

  useEffect(() => {
    void loadLessonSizes();
  }, [loadLessonSizes]);

  useEffect(() => {
    void refresh();
  }, [cards, refresh]);

  useEffect(() => {
    const quests = summary.quests.quests.filter((q) => q.done);
    const reached = [
      ...quests.map((q) => `quest:${summary.today}:${q.quest.id}`),
      ...(summary.quests.bonusAt ? [`bonus:${summary.today}`] : []),
      ...summary.achievements.map((a) => `badge:${a.badgeId}:${a.tier}`),
    ];
    if (seen.current === null) {
      seen.current = new Set(reached);
      return;
    }
    const fresh = reached.filter((key) => !seen.current!.has(key));
    fresh.forEach((key) => seen.current!.add(key));
    // Only the newest step is shown; the toast replaces itself anyway.
    const last = fresh.at(-1);
    if (!last) return;
    const [kind, a, b] = last.split(':') as [string, string, string];
    if (kind === 'quest') {
      const quest = quests.find((q) => q.quest.id === b);
      celebrate({
        title: `Tagesaufgabe: ${quest?.quest.title ?? ''}`,
        xp: quest?.quest.xp ?? 0,
        big: false,
      });
    } else if (kind === 'bonus') {
      celebrate({
        title: 'Alle drei Tagesaufgaben geschafft',
        xp: QUEST_XP.bonus,
        big: true,
      });
    } else {
      const badge = BADGES.find((x) => x.id === a);
      const tiered = (badge?.thresholds.length ?? 1) > 1;
      celebrate({
        title: `Abzeichen: ${badge?.name ?? a}${tiered ? ` (${TIER_LABEL[b as keyof typeof TIER_LABEL]})` : ''}`,
        xp: 0,
        big: true,
      });
    }
  }, [summary, celebrate]);

  return null;
}
