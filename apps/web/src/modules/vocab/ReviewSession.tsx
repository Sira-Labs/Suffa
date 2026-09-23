import { useMemo, useState } from 'react';
import type { CardKind, ReviewRating, SrsCard } from '@/types';
import { ArabicText, Feedback, RatingButtons, RecallInput } from '@/components';
import { diffArabic, gradeRecall, resolveCard, type RecallGrade } from '@/services/srs';
import { speakArabic, isTtsSupported } from '@/services/speech';
import { useContentStore, useSettingsStore, useSrsStore, useSyncStore } from '@/state';

interface ReviewSessionProps {
  kinds?: CardKind[];
  title: string;
  /** Allow multiple choice as a labelled "training wheel" (default: off). */
  allowRecognitionAid?: boolean;
}

type Phase = 'prompt' | 'graded';

/**
 * Reusable study session following "active recall before recognition":
 * the default is producing the answer from memory. Multiple choice can only be
 * enabled as an explicitly labelled training wheel.
 */
export function ReviewSession({ kinds, title, allowRecognitionAid }: ReviewSessionProps) {
  const userVocab = useContentStore((s) => s.userVocab);
  const showTr = useSettingsStore((s) => s.settings.showTransliteration);
  const review = useSrsStore((s) => s.review);
  const refreshPending = useSyncStore((s) => s.refreshPending);
  const dailyGoal = useSettingsStore((s) => s.settings.dailyGoal);

  const [queue, setQueue] = useState<SrsCard[]>(() =>
    useSrsStore.getState().getQueue(kinds, dailyGoal)
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
      <div className="card stack">
        <h2>{title}</h2>
        <p className="feedback-good">
          🎉 Keine fälligen Karten in diesem Modus. {done > 0 && `(${done} bearbeitet)`}
        </p>
        <p className="muted">
          Komm später wieder – die Spaced-Repetition-Queue plant die nächste Wiederholung
          automatisch.
        </p>
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

  return (
    <div className="stack">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h2 style={{ margin: 0 }}>{title}</h2>
        <span className="badge">
          {done} / {done + queue.length} · Ziel {dailyGoal}
        </span>
      </div>

      <div className="card stack" style={{ alignItems: 'center', textAlign: 'center' }}>
        {card.leech && <span className="badge feedback-warn">⚠ Schwieriges Wort</span>}
        {resolved.promptIsArabic ? (
          <ArabicText
            size="lg"
            onClick={() => resolved.speakable && speakArabic(resolved.speakable)}
          >
            {resolved.prompt}
          </ArabicText>
        ) : (
          <p style={{ fontSize: '1.4rem', margin: 0 }}>{resolved.prompt}</p>
        )}
        {showTr && resolved.transliteration && phase === 'graded' && (
          <em className="muted">[{resolved.transliteration}]</em>
        )}
        {resolved.hint && <span className="muted">{resolved.hint}</span>}

        {phase === 'prompt' && !useAid && (
          <div style={{ width: '100%' }}>
            <RecallInput
              value={answer}
              onChange={setAnswer}
              onSubmit={() => check(answer)}
              arabic={resolved.answerIsArabic}
              placeholder={resolved.answerIsArabic ? 'Antwort auf Arabisch…' : 'Antwort…'}
              autoFocus
            />
            <div
              className="row"
              style={{ marginTop: '0.75rem', justifyContent: 'center' }}
            >
              <button className="btn btn-primary" onClick={() => check(answer)}>
                Prüfen
              </button>
              {isTtsSupported() && resolved.speakable && (
                <button className="btn" onClick={() => speakArabic(resolved.speakable!)}>
                  🔊 Anhören
                </button>
              )}
              {allowRecognitionAid && (
                <button className="btn" onClick={() => setUseAid(true)} title="Stützrad">
                  Multiple-Choice (Stützrad)
                </button>
              )}
            </div>
          </div>
        )}

        {phase === 'prompt' && useAid && (
          <div className="stack" style={{ width: '100%' }}>
            <span className="badge feedback-warn">
              Stützrad: Wiedererkennen statt Produzieren
            </span>
            {choices.map((choice) => (
              <button
                key={choice}
                className={`btn ${resolved.answerIsArabic ? 'arabic-inline' : ''}`}
                style={{ fontSize: '1.3rem' }}
                onClick={() => check(choice)}
              >
                {choice}
              </button>
            ))}
          </div>
        )}

        {phase === 'graded' && grade && (
          <div className="stack" style={{ width: '100%' }}>
            <Feedback
              verdict={grade.verdict}
              expected={resolved.answer}
              expectedIsArabic={resolved.answerIsArabic}
              alsoCorrect={grade.alsoCorrect}
              diff={
                resolved.answerIsArabic ? diffArabic(answer, resolved.answer) : undefined
              }
              explanation={resolved.hint}
            />
            <RatingButtons card={card} onRate={(r) => void handleRate(r)} />
          </div>
        )}
      </div>
    </div>
  );
}
