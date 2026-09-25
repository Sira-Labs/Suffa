import { useMemo } from 'react';
import {
  DEFAULT_WEEKLY_GOAL,
  isTimeZone,
  isWeeklyGoal,
  LESSON_SIZES,
  summarize,
  type EngagementSummary,
} from '@suffa/engagement';
import { browserTimeZone } from '@/modules/settings/devices';
import { reconcile } from '@/services/engagement/reconcile';
import { ApiSyncProvider } from '@/services/sync/ApiSyncProvider';
import {
  useCheckInStore,
  useEngagementStore,
  useEnrollmentStore,
  useListenStore,
  usePracticeStore,
  useSettingsStore,
  useSyncStore,
} from '@/state';

/** The account's time zone when signed in (same as the server), else the device's. */
export function useLearnerTimeZone(): string {
  const provider = useSyncStore((s) => s.provider);
  // Re-read on auth changes (sign-in brings the account's zone).
  useSyncStore((s) => s.auth);
  const account =
    provider instanceof ApiSyncProvider ? provider.currentUser()?.timeZone : null;
  return account && isTimeZone(account) ? account : browserTimeZone();
}

/**
 * XP, level, today's quests, streak, weekly goal and badges, from local data only (works
 * offline); the same rules run on the server after a sync.
 */
export function useLocalEngagement(now?: Date): EngagementSummary {
  const logs = useEngagementStore((s) => s.logs);
  const tracks = useListenStore((s) => s.progress);
  const practice = usePracticeStore((s) => s.records);
  const enrollments = useEnrollmentStore((s) => s.enrollments);
  const exams = useEnrollmentStore((s) => s.exams);
  const checkIns = useCheckInStore((s) => s.checkIns);
  const goal = useSettingsStore((s) => s.settings.weeklyGoal);
  const tutor = useEngagementStore((s) => s.tutorAvailable);
  const timeZone = useLearnerTimeZone();
  const minute = now ?? new Date();
  // Recomputed when data changes, and at least once per rendered minute (day change).
  const stamp = Math.floor(minute.getTime() / 60_000);
  return useMemo(
    () =>
      summarize(
        {
          reviews: logs,
          tracks: Object.values(tracks),
          practice: Object.values(practice),
          checkIns: Object.values(checkIns),
          exams,
          enrollments: Object.values(enrollments),
          lessonSizes: LESSON_SIZES,
        },
        {
          timeZone,
          weeklyGoal: isWeeklyGoal(goal) ? goal : DEFAULT_WEEKLY_GOAL,
          now: new Date(stamp * 60_000),
          features: { tutor },
        }
      ),
    [logs, tracks, practice, checkIns, exams, enrollments, goal, timeZone, stamp, tutor]
  );
}

/** What the app shows: local results, reconciled with the server's once it caught up. */
export function useEngagement(now?: Date): EngagementSummary {
  const local = useLocalEngagement(now);
  const server = useEngagementStore((s) => s.server);
  const pending = useSyncStore((s) => s.pending);
  return useMemo(() => reconcile(local, server, pending), [local, server, pending]);
}
