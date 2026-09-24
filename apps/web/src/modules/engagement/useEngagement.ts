import { useMemo } from 'react';
import {
  DEFAULT_WEEKLY_GOAL,
  isTimeZone,
  isWeeklyGoal,
  summarize,
  type EngagementSummary,
} from '@suffa/engagement';
import { browserTimeZone } from '@/modules/settings/devices';
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
export function useEngagement(now?: Date): EngagementSummary {
  const logs = useEngagementStore((s) => s.logs);
  const sizes = useEngagementStore((s) => s.lessonSizes);
  const tracks = useListenStore((s) => s.progress);
  const practice = usePracticeStore((s) => s.records);
  const enrollments = useEnrollmentStore((s) => s.enrollments);
  const exams = useEnrollmentStore((s) => s.exams);
  const checkIns = useCheckInStore((s) => s.checkIns);
  const goal = useSettingsStore((s) => s.settings.weeklyGoal);
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
          lessonSizes: sizes,
        },
        {
          timeZone,
          weeklyGoal: isWeeklyGoal(goal) ? goal : DEFAULT_WEEKLY_GOAL,
          now: new Date(stamp * 60_000),
        }
      ),
    [logs, sizes, tracks, practice, checkIns, exams, enrollments, goal, timeZone, stamp]
  );
}
