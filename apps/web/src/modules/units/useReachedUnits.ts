import { useEffect, useMemo } from 'react';
import { content } from '@/content';
import { reachedUnits } from '@/services/enrollment';
import { inReachedUnits, introducibleRefs } from '@/services/reach';
import { useContentStore, useEnrollmentStore, useSrsStore } from '@/state';

/** Units the learner has reached, and a filter for content of those units. */
export function useReachedUnits(): {
  units: number[];
  keep: ReturnType<typeof inReachedUnits>;
} {
  const exams = useEnrollmentStore((s) => s.exams);
  return useMemo(() => {
    const units = reachedUnits(exams);
    return { units, keep: inReachedUnits(units) };
  }, [exams]);
}

/**
 * Keeps the SRS scope in step with the reached units: new cards come only from those units
 * (and own words). Mounted once by the app shell.
 */
export function useTrainingScope(): void {
  const { units } = useReachedUnits();
  const userVocab = useContentStore((s) => s.userVocab);
  const setIntroducible = useSrsStore((s) => s.setIntroducible);
  useEffect(() => {
    setIntroducible(introducibleRefs(content, units, userVocab));
  }, [units, userVocab, setIntroducible]);
}
