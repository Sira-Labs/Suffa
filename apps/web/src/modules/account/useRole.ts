import { ApiSyncProvider } from '@/services/sync/ApiSyncProvider';
import { useSyncStore } from '@/state';

/** The signed-in user's role (learner, teacher, admin), or null without an account. */
export function useRole(): string | null {
  const provider = useSyncStore((s) => s.provider);
  // Re-render when the signed-in user changes.
  useSyncStore((s) => s.auth);
  return provider instanceof ApiSyncProvider
    ? (provider.currentUser()?.role ?? null)
    : null;
}
