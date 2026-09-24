import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { GrammatikFrage, GrammatikPunkt, UnitPracticeScope } from '@/types';
import { ArabicText } from '@/components';
import { TaskQueue } from '@/components/TaskQueue';
import { content } from '@/content';
import { stableShuffle } from '@/services/practice';
import { speakArabic } from '@/services/speech';

const ARABIC = /[؀-ۿ]/;

/**
 * Grammar inside a unit: the section's rule with a short explanation and examples to listen
 * to, then its questions one by one. A question counts on the first correct answer.
 */
export function Grammar({
  scope,
  section,
}: {
  scope: UnitPracticeScope;
  section?: number;
}) {
  const points = useMemo(
    () =>
      content.grammatik.filter(
        (p) =>
          p.einheit === scope.unit && (section === undefined || p.abschnitt === section)
      ),
    [scope.unit, section]
  );
  const questions = useMemo(
    () => new Map(points.flatMap((p) => p.fragen.map((q) => [q.id, q] as const))),
    [points]
  );
  const [solved, setSolved] = useState<ReadonlySet<string>>(() => new Set());

  if (points.length === 0) {
    return <p className="muted">Zu diesem Abschnitt gibt es noch keine Grammatik.</p>;
  }
  const isDone = (id: string) => solved.has(id) || Boolean(scope.isPractised?.(id));
  const markDone = (id: string) => {
    if (solved.has(id)) return;
    setSolved((prev) => new Set(prev).add(id));
    scope.onPractised(id);
  };

  return (
    <div className="stack" style={{ gap: '1.25rem' }}>
      {points.map((point) => (
        <RuleCard key={point.id} point={point} />
      ))}
      <h2 className="eyebrow" style={{ margin: 0 }}>
        Kurz geprüft
      </h2>
      <TaskQueue
        ids={[...questions.keys()]}
        isDone={isDone}
        complete={
          <div
            className="card stack"
            style={{ alignItems: 'center', textAlign: 'center' }}
          >
            <strong className="feedback-good">✓ Alle Fragen richtig</strong>
            <Link to={`/units/${scope.unit}`} className="btn btn-primary">
              Zurück zur Einheit
            </Link>
          </div>
        }
      >
        {(id, position, next) => (
          <QuestionCard
            key={id}
            question={questions.get(id)!}
            position={position}
            onCorrect={() => markDone(id)}
            onNext={next}
          />
        )}
      </TaskQueue>
    </div>
  );
}

function RuleCard({ point }: { point: GrammatikPunkt }) {
  return (
    <section className="card stack grammar-rule" aria-labelledby={`${point.id}-title`}>
      <h2 id={`${point.id}-title`} style={{ margin: 0 }}>
        {point.titel}
      </h2>
      <p className="grammar-rule-line">
        <Mixed text={point.regel} />
      </p>
      {point.erklaerung.map((paragraph) => (
        <p key={paragraph} style={{ margin: 0 }}>
          <Mixed text={paragraph} />
        </p>
      ))}
      <ul className="grammar-examples" aria-label="Beispiele">
        {point.beispiele.map((example) => (
          <li key={example.ar}>
            <button
              type="button"
              className="grammar-example"
              onClick={() => speakArabic(example.ar)}
              aria-label={`${example.de} – anhören`}
            >
              <ArabicText>{example.ar}</ArabicText>
              <span className="muted">{example.de}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** German text with Arabic words in it: Arabic runs get the Arabic font and direction. */
function Mixed({ text }: { text: string }) {
  const parts = text.split(/([؀-ۿ][؀-ۿ\s…/]*[؀-ۿ]|[؀-ۿ])/u);
  return (
    <>
      {parts.map((part, i) =>
        ARABIC.test(part) ? (
          <bdi key={i} lang="ar" className="arabic-inline">
            {part}
          </bdi>
        ) : (
          part
        )
      )}
    </>
  );
}

function QuestionCard({
  question,
  position,
  onCorrect,
  onNext,
}: {
  question: GrammatikFrage;
  position: string;
  onCorrect(): void;
  onNext(): void;
}) {
  const options = useMemo(
    () => stableShuffle([question.antwort, ...question.ablenker], question.id, (o) => o),
    [question]
  );
  const [wrong, setWrong] = useState<ReadonlySet<string>>(() => new Set());
  const [correct, setCorrect] = useState(false);

  const pick = (option: string) => {
    if (correct) return;
    if (option === question.antwort) {
      setCorrect(true);
      onCorrect();
    } else {
      setWrong((prev) => new Set(prev).add(option));
    }
  };

  return (
    <div className="card stack">
      <p className="muted" style={{ margin: 0 }}>
        {position}
      </p>
      <strong>
        <Mixed text={question.frage} />
      </strong>
      {question.ar && (
        <p lang="ar" dir="rtl" className="arabic grammar-question-ar">
          {question.ar}
        </p>
      )}
      <div className="grammar-options" role="group" aria-label="Antworten">
        {options.map((option) => {
          const arabic = ARABIC.test(option) && !/[a-zäöü]/i.test(option);
          return (
            <button
              key={option}
              lang={arabic ? 'ar' : undefined}
              dir={arabic ? 'rtl' : undefined}
              className={`btn grammar-option${arabic ? ' arabic-inline' : ''}${
                correct && option === question.antwort ? ' btn-accent' : ''
              }${wrong.has(option) ? ' cloze-choice-wrong' : ''}`}
              disabled={wrong.has(option) || (correct && option !== question.antwort)}
              onClick={() => pick(option)}
            >
              {arabic ? option : <Mixed text={option} />}
            </button>
          );
        })}
      </div>
      {correct ? (
        <>
          <span className="feedback-good">✓ Richtig</span>
          <button className="btn btn-primary" onClick={onNext}>
            Weiter
          </button>
        </>
      ) : (
        <>
          {wrong.size > 0 && (
            <span className="feedback-bad">
              Nicht ganz – schau noch einmal in die Regel oben.
            </span>
          )}
          <button className="btn" style={{ alignSelf: 'start' }} onClick={onNext}>
            Überspringen
          </button>
        </>
      )}
    </div>
  );
}
