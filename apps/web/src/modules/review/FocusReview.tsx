import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import type { CardKind, SrsCard } from '@/types';
import { Icon } from '@/components/Icon';
import { content } from '@/content';
import { dialogueSections } from '@/services/practice';
import { ReviewSession } from '@/modules/vocab/ReviewSession';
import { reviewLogRepo } from '@/services/storage';
import { weakCards } from '@/services/stats';
import { NEW_PER_DAY, reviewsToday } from '@/services/today';

/** New words per unit session: a unit has ~30 words, a sitting should stay short. */
export const UNIT_SESSION_WORDS = 10;
/** Wobbly cards per extra practice sitting. */
export const WEAK_SESSION_CARDS = 20;
import { useContentStore, useSrsStore } from '@/state';

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
  // ?focus=weak (from "Heute"): the wobbly words, due or not.
  const [weak, setWeak] = useState<SrsCard[] | null>(null);
  const [params] = useSearchParams();
  const weakOnly = params.get('focus') === 'weak';
  // ?more=1 (offered when nothing is due): another batch of new words beyond today's plan.
  const more = params.get('more') === '1';
  const unit = Number(params.get('unit')) || null;
  const userVocab = useContentStore((s) => s.userVocab);
  const section = params.get('section');
  // With ?unit=n (from a unit's path): only that unit's words, all of them may be new;
  // &section=k narrows to dialogue k's words, &section=eigene to the learner's own words.
  const unitWords = unit ? sessionWords(unit, section, userVocab) : null;
  const title = weakOnly
    ? 'Wackelige Wörter'
    : !unit
      ? 'Wiederholen'
      : section === 'eigene'
        ? `Einheit ${unit} · Eigene Wörter`
        : section
          ? `Einheit ${unit} · Dialog ${section} · Wörter`
          : `Einheit ${unit} · Vokabeln`;

  useEffect(() => {
    let cancelled = false;
    void reviewLogRepo.all().then((logs) => {
      if (cancelled) return;
      setNewLimit(
        more ? NEW_PER_DAY : Math.max(0, NEW_PER_DAY - reviewsToday(logs).newLearned)
      );
      setWeak(weakCards(useSrsStore.getState().cards, logs).slice(0, WEAK_SESSION_CARDS));
    });
    return () => {
      cancelled = true;
    };
  }, [more, weakOnly]);

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
          // A new mode (wobbly words, more new words) starts a fresh session.
          key={`${weakOnly}-${more}-${unit}-${section}-${newLimit}`}
          kinds={ALL_KINDS}
          newKinds={NEW_KINDS}
          newLimit={
            unitWords
              ? Math.min(unitWords.length, UNIT_SESSION_WORDS) * NEW_KINDS.length
              : newLimit
          }
          contentRefs={unitWords ?? undefined}
          cards={weakOnly ? (weak ?? []) : undefined}
          title={title}
          variant="focus"
          allowRecognitionAid
          emptyActions={
            unit ? undefined : (
              <KeepPractising weakCount={weakOnly ? 0 : (weak?.length ?? 0)} />
            )
          }
        />
      )}
    </div>
  );
}

/**
 * Nothing due, but the day's review quest may still ask for cards: offer the wobbly words
 * (due or not) and another batch of new words. Both count as reviews for the quests.
 */
function KeepPractising({ weakCount }: { weakCount: number }) {
  // The same selection the session makes (new vocabulary cards the learner may reach).
  const newCount = useSrsStore((s) => s.getQueue)(
    NEW_KINDS,
    NEW_PER_DAY,
    NEW_KINDS
  ).length;
  return (
    <>
      <p className="muted" style={{ margin: 0 }}>
        Für heute ist alles wiederholt. Weiterüben zählt trotzdem für deine Tagesaufgaben.
      </p>
      <div className="row" style={{ justifyContent: 'center', flexWrap: 'wrap' }}>
        {weakCount > 0 && (
          <Link className="btn btn-primary" to="/review?focus=weak" replace>
            Wackelige Wörter üben ({weakCount})
          </Link>
        )}
        {newCount > 0 && (
          <Link
            className={weakCount > 0 ? 'btn' : 'btn btn-primary'}
            to="/review?more=1"
            replace
          >
            {Math.min(NEW_PER_DAY, newCount)} weitere neue Wörter
          </Link>
        )}
        {weakCount === 0 && newCount === 0 && (
          <Link className="btn btn-primary" to="/units">
            Dialog hören
          </Link>
        )}
        <Link className="btn" to="/">
          Zu Heute
        </Link>
      </div>
    </>
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
