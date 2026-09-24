import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { DialogZeile, UnitPracticeScope, Vokabel } from '@/types';
import { ArabicText, Feedback, RecallInput } from '@/components';
import { Icon } from '@/components/Icon';
import { TaskQueue } from '@/components/TaskQueue';
import { content } from '@/content';
import { useReachedUnits } from '@/modules/units/useReachedUnits';
import {
  lineId,
  scopedDialogues,
  scopedWords,
  WRITE_EXERCISES,
  writeItemId,
  writeTasks,
  type WriteExercise,
} from '@/services/practice';
import { diffArabic, gradeAnswer, type AnswerVerdict } from '@/services/srs';
import { speakArabic, isTtsSupported } from '@/services/speech';

const EXERCISE_LABELS: Record<WriteExercise, string> = {
  abschreiben: 'Abschreiben',
  diktat: 'Diktat',
  umschrift: 'Umschrift → Schrift',
  satzbau: 'Satzbau',
  uebersetzung: 'Übersetzen',
};

/**
 * Writing practice as a guided sequence: copying, dictation, transliteration → script,
 * sentence building, translation. Each exercise is its own step with its own progress; it
 * continues with the first open task, never repeats a solved one and moves on after a correct
 * answer. With a `scope` (inside a unit) it uses only that unit's (or section's) words and
 * lines and reports every solved task, so all steps count toward the unit.
 */
export function Writing({ scope }: { scope?: UnitPracticeScope } = {}) {
  const { keep } = useReachedUnits();
  // Outside a unit: the words and dialogues of every unit reached so far.
  const words = useMemo(
    () => (scope ? scopedWords(content.vokabeln, scope) : content.vokabeln.filter(keep)),
    [scope, keep]
  );
  const dialogues = useMemo(
    () =>
      scope ? scopedDialogues(content.dialoge, scope) : content.dialoge.filter(keep),
    [scope, keep]
  );
  const tasks = useMemo(
    () =>
      writeTasks(
        dialogues,
        words.map((w) => w.id)
      ),
    [dialogues, words]
  );
  const wordById = useMemo(() => new Map(words.map((w) => [w.id, w])), [words]);
  const lineById = useMemo(
    () =>
      new Map(
        dialogues.flatMap((d) => d.zeilen.map((z, i) => [lineId(d.id, i), z] as const))
      ),
    [dialogues]
  );
  // Solved in this sitting: immediate, and the only record outside a unit.
  const [solved, setSolved] = useState<ReadonlySet<string>>(() => new Set());
  const isDone = (exercise: WriteExercise, id: string) => {
    const key = writeItemId(exercise, id);
    return solved.has(key) || Boolean(scope?.isPractised?.(key));
  };
  const markDone = (exercise: WriteExercise, id: string) => {
    const key = writeItemId(exercise, id);
    if (solved.has(key)) return;
    setSolved((prev) => new Set(prev).add(key));
    scope?.onPractised(key);
  };

  const steps = WRITE_EXERCISES.filter((ex) => tasks[ex].length > 0);
  const openCount = (ex: WriteExercise) =>
    tasks[ex].filter((id) => !isDone(ex, id)).length;
  const [step, setStep] = useState<WriteExercise>(
    () => steps.find((ex) => openCount(ex) > 0) ?? steps[0] ?? 'abschreiben'
  );

  if (words.length === 0) {
    return (
      <p className="muted">Für diese Einheit gibt es noch keine Wörter zum Schreiben.</p>
    );
  }
  const nextStep = steps[steps.indexOf(step) + 1];

  return (
    <div className="stack">
      {!scope && <h1 style={{ margin: 0 }}>Schreiben</h1>}
      <ol className="row write-steps" aria-label="Schreibübungen">
        {steps.map((ex) => {
          const total = tasks[ex].length;
          const done = total - openCount(ex);
          return (
            <li key={ex}>
              <button
                className={`btn ${ex === step ? 'btn-accent' : ''}`}
                aria-pressed={ex === step}
                onClick={() => setStep(ex)}
              >
                {done === total && <Icon name="check" size={14} strokeWidth={2.6} />}
                {EXERCISE_LABELS[ex]}
                {scope && (
                  <span className="write-step-count">
                    {done}/{total}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ol>
      <TaskQueue
        key={step}
        ids={tasks[step]}
        isDone={(id) => isDone(step, id)}
        complete={
          <div
            className="card stack"
            style={{ alignItems: 'center', textAlign: 'center' }}
          >
            <strong className="feedback-good">✓ {EXERCISE_LABELS[step]} geschafft</strong>
            {nextStep ? (
              <button className="btn btn-primary" onClick={() => setStep(nextStep)}>
                Weiter: {EXERCISE_LABELS[nextStep]}
              </button>
            ) : (
              scope && (
                <Link to={`/units/${scope.unit}`} className="btn btn-primary">
                  Zurück zur Einheit
                </Link>
              )
            )}
          </div>
        }
      >
        {(id, position, next) => {
          const solve = () => markDone(step, id);
          const common = { position, onCorrect: solve, onNext: next };
          if (step === 'satzbau')
            return <SentenceBuilder key={id} {...common} line={lineById.get(id)!} />;
          if (step === 'uebersetzung')
            return <Translation key={id} {...common} line={lineById.get(id)!} />;
          return <WordTask key={id} {...common} mode={step} word={wordById.get(id)!} />;
        }}
      </TaskQueue>
    </div>
  );
}

interface TaskProps {
  /** "noch 5 offen" */
  position: string;
  onCorrect(): void;
  onNext(): void;
}

/** One answer check: solved once it is correct (harakāt optional). */
function useCheck(target: string, onCorrect: () => void, grade = gradeAnswer) {
  const [value, setValue] = useState('');
  const [verdict, setVerdict] = useState<AnswerVerdict | null>(null);
  const correct = verdict !== null && verdict !== 'wrong';
  const check = () => {
    const graded = grade(value, target);
    setVerdict(graded);
    if (graded !== 'wrong') onCorrect();
  };
  return { value, setValue, verdict, correct, check };
}

function TaskButtons({
  correct,
  onCheck,
  onNext,
}: {
  correct: boolean;
  onCheck(): void;
  onNext(): void;
}) {
  return (
    <div className="row">
      {correct ? (
        <button className="btn btn-primary" onClick={onNext}>
          Weiter
        </button>
      ) : (
        <>
          <button className="btn btn-primary" onClick={onCheck}>
            Prüfen
          </button>
          <button className="btn" onClick={onNext}>
            Überspringen
          </button>
        </>
      )}
    </div>
  );
}

/**
 * The three word exercises: copy the shown word, write the heard word, or write the word from
 * its transliteration. Copying shows tashkīl, transliteration and meaning.
 */
function WordTask({
  mode,
  word,
  position,
  onCorrect,
  onNext,
}: TaskProps & { mode: 'abschreiben' | 'diktat' | 'umschrift'; word: Vokabel }) {
  const { value, setValue, verdict, correct, check } = useCheck(word.ar, onCorrect);
  const prompt = {
    abschreiben: 'Schreib das Wort ab. Vokalzeichen sind freiwillig.',
    diktat: 'Hör das Wort und schreib es.',
    umschrift: 'Schreib das Wort in arabischer Schrift.',
  }[mode];

  return (
    <div className="card stack" style={{ alignItems: 'center', textAlign: 'center' }}>
      <p className="muted" style={{ margin: 0 }}>
        {prompt} · {position}
      </p>
      {mode === 'abschreiben' && (
        <>
          <ArabicText size="hero" onClick={() => speakArabic(word.ar)}>
            {word.ar}
          </ArabicText>
          <span>
            <strong>{word.tr}</strong> <span className="muted">· {word.de}</span>
          </span>
        </>
      )}
      {mode === 'diktat' && (
        <>
          <button
            className="btn btn-primary"
            onClick={() => speakArabic(word.ar)}
            disabled={!isTtsSupported()}
          >
            <Icon name="listen" size={18} /> Vorlesen
          </button>
          {!isTtsSupported() && (
            <span className="muted">
              (Keine Sprachausgabe – Wort: <ArabicText>{word.ar}</ArabicText>)
            </span>
          )}
        </>
      )}
      {mode === 'umschrift' && (
        <>
          <strong style={{ fontSize: '1.6rem' }}>{word.tr}</strong>
          <span className="muted">({word.de})</span>
        </>
      )}
      <div style={{ width: '100%' }}>
        <RecallInput
          value={value}
          onChange={setValue}
          onSubmit={correct ? onNext : check}
          placeholder="Hier schreiben…"
          disabled={correct}
        />
      </div>
      <TaskButtons correct={correct} onCheck={check} onNext={onNext} />
      {verdict && (
        <Feedback
          verdict={verdict}
          expected={word.ar}
          diff={diffArabic(value, word.ar)}
          explanation={mode === 'abschreiben' ? undefined : word.de}
        />
      )}
    </div>
  );
}

/** Punctuation does not decide a sentence answer. */
function gradeSentence(input: string, target: string): AnswerVerdict {
  const bare = (text: string) => text.replace(/[.,!?؟،؛:«»"“”…–-]/g, ' ').trim();
  return gradeAnswer(bare(input).replace(/\s+/g, ' '), bare(target).replace(/\s+/g, ' '));
}

/** Sentence building by tapping the words in order (mobile-friendly). */
function SentenceBuilder({
  line,
  position,
  onCorrect,
  onNext,
}: TaskProps & { line: DialogZeile }) {
  const correctWords = useMemo(() => line.ar.split(/\s+/), [line]);
  const [pool, setPool] = useState<string[]>(() => shuffle(correctWords));
  const [built, setBuilt] = useState<string[]>([]);
  const [checked, setChecked] = useState(false);
  const isCorrect = built.join(' ') === correctWords.join(' ');

  const check = () => {
    setChecked(true);
    if (isCorrect) onCorrect();
  };
  const reset = () => {
    setPool(shuffle(correctWords));
    setBuilt([]);
    setChecked(false);
  };

  return (
    <div className="card stack">
      <p className="muted" style={{ margin: 0 }}>
        Bring die Wörter in die richtige Reihenfolge: „{line.de}“ · {position}
      </p>
      <div
        className="card arabic"
        style={{ minHeight: 60, background: 'var(--bg-elev-2)', textAlign: 'right' }}
      >
        {built.map((w, i) => (
          <button
            key={`${w}-${i}`}
            className="btn arabic-inline"
            style={{ fontSize: '1.3rem', margin: '0.2rem' }}
            disabled={checked && isCorrect}
            onClick={() => {
              setBuilt((b) => b.filter((_, j) => j !== i));
              setPool((p) => [...p, w]);
              setChecked(false);
            }}
          >
            {w}
          </button>
        ))}
      </div>
      <div className="row" style={{ justifyContent: 'center' }}>
        {pool.map((w, i) => (
          <button
            key={`${w}-${i}`}
            className="btn arabic-inline"
            style={{ fontSize: '1.3rem' }}
            onClick={() => {
              setPool((p) => p.filter((_, j) => j !== i));
              setBuilt((b) => [...b, w]);
            }}
          >
            {w}
          </button>
        ))}
      </div>
      {checked && isCorrect ? (
        <TaskButtons correct onCheck={check} onNext={onNext} />
      ) : (
        <div className="row">
          <button className="btn btn-primary" disabled={pool.length > 0} onClick={check}>
            Prüfen
          </button>
          <button className="btn" onClick={reset}>
            Zurücksetzen
          </button>
          <button className="btn" onClick={onNext}>
            Überspringen
          </button>
        </div>
      )}
      {checked && (
        <span className={isCorrect ? 'feedback-good' : 'feedback-bad'}>
          {isCorrect
            ? '✓ Richtig zusammengesetzt!'
            : '✗ Noch nicht – tipp Wörter an, um sie zurückzulegen.'}
        </span>
      )}
    </div>
  );
}

/** Translation DE → AR (tashkīl- and punctuation-tolerant). */
function Translation({
  line,
  position,
  onCorrect,
  onNext,
}: TaskProps & { line: DialogZeile }) {
  const { value, setValue, verdict, correct, check } = useCheck(
    line.ar,
    onCorrect,
    gradeSentence
  );
  return (
    <div className="card stack" style={{ alignItems: 'center', textAlign: 'center' }}>
      <p className="muted" style={{ margin: 0 }}>
        Übersetze ins Arabische · {position}
      </p>
      <strong style={{ fontSize: '1.2rem' }}>{line.de}</strong>
      <div style={{ width: '100%' }}>
        <RecallInput
          value={value}
          onChange={setValue}
          onSubmit={correct ? onNext : check}
          disabled={correct}
        />
      </div>
      <TaskButtons correct={correct} onCheck={check} onNext={onNext} />
      {verdict && (
        <Feedback
          verdict={verdict}
          expected={line.ar}
          diff={diffArabic(value, line.ar)}
          explanation={
            correct
              ? undefined
              : 'Es zählt die Formulierung aus dem Dialog – vergleiche und versuch es noch einmal.'
          }
        />
      )}
    </div>
  );
}

function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }
  return copy;
}
