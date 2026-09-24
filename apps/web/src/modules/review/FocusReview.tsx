import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import type { CardKind } from '@/types';
import { Icon } from '@/components/Icon';
import { content } from '@/content';
import { dialogueSections } from '@/services/practice';
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
  const section = params.get('section');
  // With ?unit=n (from a unit's path): only that unit's words, all of them may be new;
  // &section=k narrows to dialogue k's words, &section=eigene to the learner's own words.
  const unitWords = unit ? sessionWords(unit, section, userVocab) : null;
  const title = !unit
    ? 'Wiederholen'
    : section === 'eigene'
      ? `Einheit ${unit} · Eigene Wörter`
      : section
        ? `Einheit ${unit} · Dialog ${section} · Wörter`
        : `Einheit ${unit} · Vokabeln`;

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
          title={title}
          variant="focus"
          allowRecognitionAid
        />
      )}
    </div>
  );
}

function sessionWords(
  unit: number,
  section: string | null,
  userVocab: readonly { id: string; einheit?: number | null }[]
): string[] {
  const own = userVocab.filter((v) => v.einheit === unit).map((v) => v.id);
  if (section === 'eigene') return own;
  const planned = dialogueSections(content, unit).find((s) => s.no === Number(section));
  if (planned) return planned.wordIds;
  return [...content.vokabeln.filter((v) => v.einheit === unit).map((v) => v.id), ...own];
}
