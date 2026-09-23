import { useMemo, useState } from 'react';
import type { CardKind, ReviewRating, SrsCard } from '@/types';
import { Link } from 'react-router-dom';
import { ArabicText, Feedback, RatingButtons, RecallInput } from '@/components';
import { Icon } from '@/components/Icon';
import { diffArabic, gradeRecall, resolveCard, type RecallGrade } from '@/services/srs';
import { speakArabic, isTtsSupported } from '@/services/speech';
import { useContentStore, useSettingsStore, useSrsStore, useSyncStore } from '@/state';

interface ReviewSessionProps {
  kinds?: CardKind[];
  title: string;
  /** Allow multiple choice as a labelled "training wheel" (default: off). */
  allowRecognitionAid?: boolean;
  /** `focus`: full-screen session (route /review) with a hidden title and a larger prompt. */
  variant?: 'inline' | 'focus';
  /** Maximum new cards in this session (default: the daily goal). */
  newLimit?: number;
  /** Kinds new cards may come from (default: all of `kinds`). */
  newKinds?: CardKind[];
  /** Only cards about these content items (e.g. one unit's words). */
  contentRefs?: string[];
}

type Phase = 'prompt' | 'graded';

/**
 * Reusable study session following "active recall before recognition":
 * the default is producing the answer from memory. Multiple choice can only be
 * enabled as an explicitly labelled training wheel.
 */
export function ReviewSession({
  kinds,
  title,
  allowRecognitionAid,
  variant = 'inline',
  newLimit,
  newKinds,
  contentRefs,
}: ReviewSessionProps) {
  const focus = variant === 'focus';
  const userVocab = useContentStore((s) => s.userVocab);
  const showTr = useSettingsStore((s) => s.settings.showTransliteration);
  const review = useSrsStore((s) => s.review);
  const refreshPending = useSyncStore((s) => s.refreshPending);
  const dailyGoal = useSettingsStore((s) => s.settings.dailyGoal);

  const [queue, setQueue] = useState<SrsCard[]>(() =>
    useSrsStore.getState().getQueue(kinds, newLimit ?? dailyGoal, newKinds, contentRefs)
  );
  const [index, setIndex] = useState(0);
  const [answer, setAnswer] = useState('');
  const [phase, setPhase] = useState<Phase>('prompt');
  const [grade, setGrade] = useState<RecallGrade | null>(null);
  const [startedAt, setStartedAt] = useState(() => Date.now());
  const [done, setDone] = useState(0);
  const [useAid, setUseAid] = useState(false);

  const card = queue[index];
  const resolved = useMemo(
    () => (card ? resolveCard(card.kind, card.contentRef, userVocab) : null),
    [card, userVocab]
  );

  const choices = useMemo(() => {
    if (!resolved || !useAid) return [];
    const others = useSrsStore
      .getState()
      .cards.filter((c) => c.kind === card?.kind && c.id !== card?.id)
      .map((c) => resolveCard(c.kind, c.contentRef, userVocab))
      .filter((r): r is NonNullable<typeof r> => Boolean(r))
      .map((r) => r.answer)
      .filter((a) => a !== resolved.answer);
    const pool = [...new Set(others)].sort(() => Math.random() - 0.5).slice(0, 3);
    return [resolved.answer, ...pool].sort(() => Math.random() - 0.5);
  }, [resolved, useAid, card, userVocab]);

  if (!card || !resolved) {
    return (
      <div className={`review-stage stack${focus ? ' review-stage-focus' : ' card'}`}>
        <h2 className={focus ? 'visually-hidden' : undefined}>{title}</h2>
        <div className="review-empty">
          <span className="review-empty-icon" aria-hidden>
            <Icon name="check" size={32} strokeWidth={2.5} />
          </span>
          <p style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700 }}>
            Keine fälligen Karten{done > 0 ? ` – ${done} bearbeitet` : ''}.
          </p>
          <p className="muted" style={{ margin: 0 }}>
            Die nächste Wiederholung plant Suffa automatisch. Wie wäre es mit einem
            Dialog?
          </p>
          <div className="row" style={{ justifyContent: 'center' }}>
            <Link className="btn btn-primary" to="/library">
              Dialog hören
            </Link>
            <Link className="btn" to="/">
              Zu Heute
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const check = (raw: string) => {
    setAnswer(raw);
    setGrade(gradeRecall(raw, resolved.answer, resolved.answerIsArabic));
    setPhase('graded');
  };

  const handleRate = async (rating: ReviewRating) => {
    const duration = Date.now() - startedAt;
    await review(card, rating, duration);
    await refreshPending();
    setDone((d) => d + 1);
    // On "again", append the card to the end of the session (practise again).
    setQueue((q) => {
      const next = q.filter((_, i) => i !== index);
      if (rating === 'again') next.push(card);
      return next;
    });
    setIndex((i) => (i >= queue.length - 1 ? 0 : i));
    setAnswer('');
    setPhase('prompt');
    setStartedAt(Date.now());
    setUseAid(false);
  };

  const total = done + queue.length;
  return (
    <div className={`review-stage stack${focus ? ' review-stage-focus' : ''}`}>
      <div className="review-progress-row">
        <h2 className={focus ? 'visually-hidden' : undefined} style={{ margin: 0 }}>
          {title}
        </h2>
        <div
          className="review-progress"
          role="progressbar"
          aria-label="Fortschritt der Sitzung"
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={done}
        >
          <div style={{ width: `${total ? (done / total) * 100 : 0}%` }} />
        </div>
        <span className="muted review-count">
          {done}/{total}
          <span className="visually-hidden"> · Tagesziel {dailyGoal}</span>
        </span>
      </div>

      <div className={`review-card${focus ? '' : ' card'}`}>
        {card.leech && <span className="badge feedback-warn">Schwieriges Wort</span>}
        {resolved.promptIsArabic ? (
          <ArabicText size={focus ? 'hero' : 'lg'}>{resolved.prompt}</ArabicText>
        ) : (
          <p className="review-prompt-latin">{resolved.prompt}</p>
        )}
        {showTr && resolved.transliteration && phase === 'graded' && (
          <em className="muted">[{resolved.transliteration}]</em>
        )}
        {/* After grading, the hint is part of the feedback below. */}
        {resolved.hint && phase === 'prompt' && (
          <span className="muted">{resolved.hint}</span>
        )}
        {isTtsSupported() && resolved.speakable && (
          <button
            type="button"
            className="icon-button"
            onClick={() => speakArabic(resolved.speakable!)}
            aria-label="Aussprache anhören"
          >
            <Icon name="volume" />
          </button>
        )}
      </div>

      <div className="review-actions">
        {phase === 'prompt' && !useAid && (
          <div className="stack" style={{ gap: '0.75rem' }}>
            <RecallInput
              value={answer}
              onChange={setAnswer}
              onSubmit={() => check(answer)}
              arabic={resolved.answerIsArabic}
              placeholder={resolved.answerIsArabic ? 'Antwort auf Arabisch…' : 'Antwort…'}
              autoFocus
            />
            <button className="btn btn-primary btn-lg" onClick={() => check(answer)}>
              Prüfen
            </button>
            {allowRecognitionAid && (
              <button className="btn" onClick={() => setUseAid(true)} title="Stützrad">
                Multiple-Choice (Stützrad)
              </button>
            )}
          </div>
        )}

        {phase === 'prompt' && useAid && (
          <div className="stack" style={{ gap: '0.5rem' }}>
            <span className="badge feedback-warn">
              Stützrad: Wiedererkennen statt Produzieren
            </span>
            {choices.map((choice) => (
              <button
                key={choice}
                className={`btn btn-lg ${resolved.answerIsArabic ? 'arabic-inline' : ''}`}
                style={{ fontSize: '1.3rem' }}
                onClick={() => check(choice)}
              >
                {choice}
              </button>
            ))}
          </div>
        )}

        {phase === 'graded' && grade && (
          <div className="stack">
            <div className="card">
              <Feedback
                verdict={grade.verdict}
                expected={resolved.answer}
                expectedIsArabic={resolved.answerIsArabic}
                alsoCorrect={grade.alsoCorrect}
                diff={
                  resolved.answerIsArabic
                    ? diffArabic(answer, resolved.answer)
                    : undefined
                }
                explanation={resolved.hint}
              />
            </div>
            <RatingButtons card={card} onRate={(r) => void handleRate(r)} />
          </div>
        )}
      </div>
    </div>
  );
}
