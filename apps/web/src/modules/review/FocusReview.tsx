import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { CardKind } from '@/types';
import { Icon } from '@/components/Icon';
import { ReviewSession } from '@/modules/vocab/ReviewSession';
import { reviewLogRepo } from '@/services/storage';
import { NEW_PER_DAY, reviewsToday } from '@/services/today';

/** Due reviews come from every kind, mixed … */
const ALL_KINDS: CardKind[] = [
  'vocab_ar_de',
  'vocab_de_ar',
  'plural',
  'root_to_word',
  'nisba',
];
/** … but new words are introduced through vocabulary cards (drills follow in the trainer). */
const NEW_KINDS: CardKind[] = ['vocab_ar_de', 'vocab_de_ar'];

/**
 * Focus mode: one card at a time, no navigation (the shell hides its bars for FOCUS_PATHS).
 * Introduces at most the new words "Heute" promised, minus those already learned today.
 */
export function FocusReview() {
  const [newLimit, setNewLimit] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    void reviewLogRepo.all().then((logs) => {
      if (!cancelled)
        setNewLimit(Math.max(0, NEW_PER_DAY - reviewsToday(logs).newLearned));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="focus-page">
      <Link to="/" className="icon-button focus-close" aria-label="Sitzung beenden">
        <Icon name="close" />
      </Link>
      {newLimit !== null && (
        <ReviewSession
          kinds={ALL_KINDS}
          newKinds={NEW_KINDS}
          newLimit={newLimit}
          title="Wiederholen"
          variant="focus"
          allowRecognitionAid
        />
      )}
    </div>
  );
}
