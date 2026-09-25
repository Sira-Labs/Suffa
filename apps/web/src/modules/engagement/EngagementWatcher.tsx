import { useEffect, useRef } from 'react';
import { BADGES, QUEST_XP } from '@suffa/engagement';
import {
  useCelebrationStore,
  useEngagementStore,
  useSrsStore,
  useSyncStore,
} from '@/state';
import { TutorApi } from '@/services/tutor/tutorApi';
import { VideosApi } from '@/services/videos/videosApi';
import { useLocalEngagement } from './useEngagement';

const TIER_LABEL = { bronze: 'Bronze', silver: 'Silber', gold: 'Gold' } as const;

/**
 * Keeps the engagement inputs fresh and celebrates what was just reached: a daily quest, all
 * three (bonus), a new badge tier. What was already reached when the app opened (or arrives
 * with a sync from another device) is not celebrated again.
 */
export function EngagementWatcher() {
  const cards = useSrsStore((s) => s.cards);
  const refresh = useEngagementStore((s) => s.refresh);
  const celebrate = useCelebrationStore((s) => s.show);
  // Local results only: badges arriving from the server are not "just reached".
  const summary = useLocalEngagement();
  const seen = useRef<Set<string> | null>(null);

  useEffect(() => {
    void refresh();
  }, [cards, refresh]);

  // Whether the tutor quest can come up: asked once per sign-in, remembered for offline days.
  const signedIn = useSyncStore((s) => s.auth.status === 'signed-in');
  const setTutorAvailable = useEngagementStore((s) => s.setTutorAvailable);
  useEffect(() => {
    if (!signedIn) return;
    let cancelled = false;
    void new TutorApi().overview().then((result) => {
      if (!cancelled && result.ok) setTutorAvailable(result.value.available);
    });
    return () => {
      cancelled = true;
    };
  }, [signedIn, setTutorAvailable]);

  // Whether the video quest can come up: the public catalog has lessons (asked once a start).
  const setVideosAvailable = useEngagementStore((s) => s.setVideosAvailable);
  useEffect(() => {
    let cancelled = false;
    void new VideosApi().list().then((result) => {
      if (!cancelled && result.ok) setVideosAvailable(result.value.videos.length > 0);
    });
    return () => {
      cancelled = true;
    };
  }, [setVideosAvailable]);

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
