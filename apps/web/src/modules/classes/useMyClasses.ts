import { useEffect, useMemo, useState } from 'react';
import { ClassesApi, type ClassSummary } from '@/services/classes/classesApi';
import { ApiSyncProvider } from '@/services/sync/ApiSyncProvider';
import { useSyncStore } from '@/state';

/**
 * The signed-in user's classes, refreshed after each sync. `classes` is null while loading,
 * offline, or without an account (`online` tells which).
 */
export function useMyClasses(api?: ClassesApi) {
  const client = useMemo(() => api ?? new ClassesApi(), [api]);
  const provider = useSyncStore((s) => s.provider);
  const auth = useSyncStore((s) => s.auth);
  const lastSyncAt = useSyncStore((s) => s.lastSyncAt);
  const online = provider instanceof ApiSyncProvider && auth.status === 'signed-in';
  const [classes, setClasses] = useState<ClassSummary[] | null>(null);

  useEffect(() => {
    if (!online) return;
    let alive = true;
    void client.list().then((result) => {
      if (alive && result.ok) setClasses(result.value.classes);
    });
    return () => {
      alive = false;
    };
  }, [client, online, lastSyncAt]);

  return { online, classes: online ? classes : null };
}
