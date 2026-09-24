import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import type { CardKind } from '@/types';
import { Icon } from '@/components/Icon';
import { content } from '@/content';
import { ReviewSession } from '@/modules/vocab/ReviewSession';
import { reviewLogRepo } from '@/services/storage';
import { NEW_PER_DAY, reviewsToday } from '@/services/today';

/** New words per unit session: a unit has ~30 words, a sitting should stay short. */
export const UNIT_SESSION_WORDS = 10;
import { useContentStore } from '@/state';

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
  const [params] = useSearchParams();
  const unit = Number(params.get('unit')) || null;
  const userVocab = useContentStore((s) => s.userVocab);
  // With ?unit=n (from a unit's path): only that unit's words, all of them may be new.
  const unitWords = unit
    ? [
        ...content.vokabeln.filter((v) => v.einheit === unit).map((v) => v.id),
        ...userVocab.filter((v) => v.einheit === unit).map((v) => v.id),
      ]
    : null;

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
      <Link
        to={unit ? `/units/${unit}` : '/'}
        className="icon-button focus-close"
        aria-label="Sitzung beenden"
      >
        <Icon name="close" />
      </Link>
      {newLimit !== null && (
        <ReviewSession
          kinds={ALL_KINDS}
          newKinds={NEW_KINDS}
          newLimit={
            unitWords
              ? Math.min(unitWords.length, UNIT_SESSION_WORDS) * NEW_KINDS.length
              : newLimit
          }
          contentRefs={unitWords ?? undefined}
          title={unit ? `Einheit ${unit} · Vokabeln` : 'Wiederholen'}
          variant="focus"
          allowRecognitionAid
        />
      )}
    </div>
  );
}
