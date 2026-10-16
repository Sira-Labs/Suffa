/**
 * Keeps the class context (colours, area unlocks) in step with the user's classes. Rendered
 * once in the app; signing out forgets the class.
 */
import { useEffect } from 'react';
import { useClassContextStore, useSyncStore } from '@/state';
import { useMyClasses } from './useMyClasses';

export function ClassContextSync() {
  const { classes } = useMyClasses();
  const signedOut = useSyncStore((s) => s.auth.status === 'signed-out');
  const setClasses = useClassContextStore((s) => s.setClasses);
  useEffect(() => {
    if (classes) setClasses(classes);
    else if (signedOut) setClasses([]);
  }, [classes, signedOut, setClasses]);
  return null;
}
