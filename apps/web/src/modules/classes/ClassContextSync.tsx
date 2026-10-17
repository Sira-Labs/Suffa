/**
 * Keeps the class context (colours, area unlocks) in step with the user's classes and their
 * chosen main class. Rendered once in the app; signing out forgets the class.
 */
import { useEffect, useRef } from 'react';
import { useClassContextStore, useSettingsStore, useSyncStore } from '@/state';
import { useMyClasses } from './useMyClasses';

export function ClassContextSync() {
  const { classes } = useMyClasses();
  const status = useSyncStore((s) => s.auth.status);
  const setClasses = useClassContextStore((s) => s.setClasses);
  const mainClassId = useSettingsStore((s) => s.settings.mainClassId);
  // The app starts "signed-out" until the API answers, and stays so offline: only a real
  // sign-out (signed in before, signed out now) forgets the remembered class.
  const previous = useRef(status);
  useEffect(() => {
    const signedOut = previous.current === 'signed-in' && status === 'signed-out';
    previous.current = status;
    if (classes) setClasses(classes, mainClassId);
    else if (signedOut) setClasses([]);
  }, [classes, status, setClasses, mainClassId]);
  return null;
}
