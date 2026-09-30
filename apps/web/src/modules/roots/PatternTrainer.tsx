import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArabicText } from '@/components';
import { speakArabic } from '@/services/speech';
import { makePatternQuestion, patternWords, type PatternQuestion } from './family';
import { RootWord } from './RootWord';
import { useRootFamilies } from './useRootFamilies';

/**
 * Pattern trainer (design step 5): root + pattern → the word. Arabic builds words by pouring a
 * root into a pattern (ك ت ب + مَفْعَل = مَكْتَب); choosing the right form trains exactly that.
 */
export function PatternTrainer() {
  const families = useRootFamilies();
  const pool = useMemo(() => patternWords(families), [families]);
  const [question, setQuestion] = useState<PatternQuestion | null>(() =>
    makePatternQuestion(pool)
  );
  const [chosen, setChosen] = useState<string | null>(null);
  // The reached units load after the first render: start once there are words.
  useEffect(() => {
    if (question === null && pool.length > 0) setQuestion(makePatternQuestion(pool));
  }, [pool, question]);
  const [score, setScore] = useState({ right: 0, total: 0 });

  const next = () => {
    setQuestion(makePatternQuestion(pool));
    setChosen(null);
  };
  const choose = (ar: string) => {
    if (!question || chosen) return;
    setChosen(ar);
    const right = ar === question.answer.ar;
    setScore((s) => ({ right: s.right + Number(right), total: s.total + 1 }));
    speakArabic(question.answer.ar);
  };

  return (
    <div className="stack">
      <header className="stack" style={{ gap: '0.25rem' }}>
        <Link to="/roots" className="muted">
          ← Wurzeln & Muster
        </Link>
        <h1 style={{ margin: 0 }}>Muster-Trainer</h1>
        <p className="muted" style={{ margin: 0 }}>
          Gieß die Wurzel in das Muster: Welches Wort entsteht?
        </p>
      </header>

      {!question ? (
        <p className="card muted" style={{ margin: 0 }}>
          Noch zu wenige Wörter mit Muster. Lerne ein paar Einheiten weiter, dann geht es
          hier los.
        </p>
      ) : (
        <section className="card stack" aria-label="Aufgabe" style={{ gap: '0.9rem' }}>
          <div className="pattern-sum" aria-label="Wurzel und Muster">
            <div className="stack" style={{ gap: '0.1rem', alignItems: 'center' }}>
              <span className="eyebrow">Wurzel</span>
              <span lang="ar" dir="rtl" className="arabic arabic-lg root-letter">
                {question.answer.root.split('-').join(' ')}
              </span>
            </div>
            <span aria-hidden="true" className="pattern-plus">
              +
            </span>
            <div className="stack" style={{ gap: '0.1rem', alignItems: 'center' }}>
              <span className="eyebrow">Muster</span>
              <ArabicText size="lg">{question.pattern.wazn}</ArabicText>
            </div>
          </div>
          <p className="muted" style={{ margin: 0, textAlign: 'center' }}>
            {question.pattern.de}
          </p>
          <div className="grid pattern-options" role="group" aria-label="Antworten">
            {question.options.map((o) => {
              const state = !chosen
                ? ''
                : o.ar === question.answer.ar
                  ? 'right'
                  : o.ar === chosen
                    ? 'wrong'
                    : '';
              return (
                <button
                  key={o.key}
                  type="button"
                  className={`btn pattern-option ${state}`}
                  disabled={chosen !== null}
                  onClick={() => choose(o.ar)}
                >
                  <ArabicText size="lg">{o.ar}</ArabicText>
                </button>
              );
            })}
          </div>
          {chosen && (
            <div
              className="stack"
              role="status"
              style={{ alignItems: 'center', gap: '0.4rem' }}
            >
              <span
                className={
                  chosen === question.answer.ar ? 'feedback-good' : 'feedback-bad'
                }
              >
                {chosen === question.answer.ar ? '✓ Richtig!' : '✗ Nicht ganz.'}
              </span>
              <RootWord word={question.answer.ar} root={question.answer.root} size="lg" />
              <span>{question.answer.de}</span>
              <button type="button" className="btn btn-primary" onClick={next}>
                Nächstes Wort
              </button>
            </div>
          )}
          <p className="muted" style={{ margin: 0, textAlign: 'center' }}>
            {score.right} von {score.total} richtig
          </p>
        </section>
      )}
    </div>
  );
}
