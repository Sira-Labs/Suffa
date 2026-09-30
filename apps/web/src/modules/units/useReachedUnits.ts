import { useEffect, useMemo } from 'react';
import { content } from '@/content';
import { reachedUnits } from '@/services/enrollment';
import { inReachedUnits, introducibleRefs } from '@/services/reach';
import {
  useContentStore,
  useEnrollmentStore,
  usePracticeStore,
  useSrsStore,
} from '@/state';

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
 * Keeps the SRS scope in step with the reached units: new cards come only from those units,
 * own words, and Medina words practised in their lesson. Mounted once by the app shell.
 */
export function useTrainingScope(): void {
  const { units } = useReachedUnits();
  const userVocab = useContentStore((s) => s.userVocab);
  const setIntroducible = useSrsStore((s) => s.setIntroducible);
  const records = usePracticeStore((s) => s.records);
  const practisedWords = useMemo(
    () =>
      Object.values(records)
        .filter((r) => r.skill === 'words' && !r.deleted)
        .map((r) => r.itemId),
    [records]
  );
  useEffect(() => {
    setIntroducible(introducibleRefs(content, units, userVocab, practisedWords));
  }, [units, userVocab, practisedWords, setIntroducible]);
}
