import { useEffect, useState } from 'react';
import { content } from '@/content';
import { loadExamples } from '@/services/examples';
import { clozeWordIds } from '@/services/practice';
import { logger } from '@/services/logger';

const log = logger.child('cloze');

/** Words with a cloze task, once the example sentences are loaded (null until then). */
export function useClozeIds(): ReadonlySet<string> | null {
  const [ids, setIds] = useState<ReadonlySet<string> | null>(null);
  useEffect(() => {
    let cancelled = false;
    loadExamples()
      .then((catalog) => {
        if (!cancelled) setIds(clozeWordIds(content.vokabeln, catalog.examples));
      })
      .catch((error: unknown) => {
        // Without examples the units simply have no cloze station.
        log.warn('Example sentences could not be loaded', {
          message: error instanceof Error ? error.message : String(error),
        });
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return ids;
}
