import { useMemo } from 'react';
import { wurzelFamilien } from '@/content';
import { useReachedUnits } from '@/modules/units/useReachedUnits';
import { buildFamily, type RootFamily } from './family';

/** Every root family of the course, largest first, with what the learner has learned marked. */
export function useAllRootFamilies(): RootFamily[] {
  const { keep } = useReachedUnits();
  return useMemo(
    () =>
      [...wurzelFamilien.values()]
        .map((f) => buildFamily(f.wurzel, f.vokabeln, f.verben, keep))
        .sort((a, b) => b.words.length - a.words.length),
    [keep]
  );
}

/**
 * The root families the learner has met (at least one learned word). Words of later units and
 * our own derivations stay in the family, marked as not learned yet.
 */
export function useRootFamilies(): RootFamily[] {
  const all = useAllRootFamilies();
  return useMemo(() => all.filter((f) => f.words.some((w) => w.learned)), [all]);
}
