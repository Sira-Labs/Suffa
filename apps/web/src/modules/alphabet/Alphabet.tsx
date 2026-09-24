import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Icon } from '@/components/Icon';
import { TaskQueue } from '@/components/TaskQueue';
import {
  ALL_LETTERS,
  ALPHABET_LESSONS,
  ALPHABET_UNIT,
  lessonItems,
  letterForms,
  parseItem,
  type AlphabetLesson,
  type Letter,
} from '@/services/alphabet';
import { practiceId, stableShuffle } from '@/services/practice';
import { speakArabic } from '@/services/speech';
import { useCelebrationStore, usePracticeStore } from '@/state';

const CHOICES = 4;

function useLessonProgress(lesson: AlphabetLesson): { done: number; total: number } {
  const records = usePracticeStore((s) => s.records);
  const items = lessonItems(lesson);
  return {
    done: items.filter((item) => records[practiceId(ALPHABET_UNIT, 'letters', item)])
      .length,
    total: items.length,
  };
}

/** The alphabet course: eight short lessons, from the first letters to the vowel signs. */
export function Alphabet() {
  return (
    <div className="stack" style={{ gap: '1.25rem' }}>
      <header className="stack" style={{ gap: '0.35rem' }}>
        <h1 style={{ margin: 0 }}>Alphabet</h1>
        <p className="muted" style={{ margin: 0 }}>
          Die 28 Buchstaben in acht kurzen Lektionen. Arabisch schreibt man von rechts
          nach links, die meisten Buchstaben verbinden sich und ändern dabei leicht ihre
          Form.
        </p>
      </header>
      <ol className="alphabet-lessons" aria-label="Lektionen">
        {ALPHABET_LESSONS.map((lesson) => (
          <LessonTile key={lesson.no} lesson={lesson} />
        ))}
      </ol>
    </div>
  );
}

function LessonTile({ lesson }: { lesson: AlphabetLesson }) {
  const { done, total } = useLessonProgress(lesson);
  const finished = done === total;
  return (
    <li>
      <Link
        to={`/alphabet/${lesson.no}`}
        className={`card alphabet-lesson${finished ? ' alphabet-lesson-done' : ''}`}
      >
        <span lang="ar" dir="rtl" className="alphabet-lesson-letters arabic-inline">
          {lesson.letters.map((l) => l.char).join(' ')}
        </span>
        <span className="stack" style={{ gap: '0.1rem' }}>
          <strong>
            {lesson.no}. {lesson.title}
          </strong>
          <span className="muted" style={{ fontSize: '0.9rem' }}>
            {finished ? (
              <>
                <Icon name="check" size={14} strokeWidth={2.6} /> geschafft
              </>
            ) : (
              `${done} von ${total} Aufgaben`
            )}
          </span>
        </span>
      </Link>
    </li>
  );
}

/** One lesson: learn the letters (forms, sound, example), then recognise and find them. */
export function AlphabetLessonPage() {
  const { lesson: param } = useParams();
  const lesson = ALPHABET_LESSONS.find((l) => l.no === Number(param));
  const records = usePracticeStore((s) => s.records);
  const practise = usePracticeStore((s) => s.practise);
  const celebrate = useCelebrationStore((s) => s.show);
  const [selected, setSelected] = useState<Letter | null>(lesson?.letters[0] ?? null);
  const [solved, setSolved] = useState<ReadonlySet<string>>(() => new Set());
  const progress = useLessonProgress(lesson ?? ALPHABET_LESSONS[0]!);

  if (!lesson || !selected) {
    return (
      <div className="stack">
        <h1>Lektion nicht gefunden</h1>
        <Link to="/alphabet" className="btn">
          Zum Alphabet
        </Link>
      </div>
    );
  }
  const items = lessonItems(lesson);
  const next = ALPHABET_LESSONS.find((l) => l.no === lesson.no + 1);
  const isDone = (item: string) =>
    solved.has(item) || Boolean(records[practiceId(ALPHABET_UNIT, 'letters', item)]);
  const markDone = (item: string) => {
    if (solved.has(item)) return;
    setSolved((prev) => new Set(prev).add(item));
    void practise(ALPHABET_UNIT, 'letters', item, items).then((outcome) => {
      if (outcome.stationComplete) {
        celebrate({ title: `Lektion ${lesson.no} geschafft`, xp: outcome.xp, big: true });
      } else if (outcome.first) {
        celebrate({ title: 'Richtig', xp: outcome.xp, big: false });
      }
    });
  };

  return (
    <div className="stack" style={{ gap: '1.25rem' }}>
      <Link to="/alphabet" className="back-link">
        <Icon name="arrowLeft" size={18} />
        Alphabet
      </Link>
      <header className="stack" style={{ gap: '0.35rem' }}>
        <span className="eyebrow" style={{ color: 'var(--accent)' }}>
          Lektion {lesson.no}
        </span>
        <h1 lang="ar" dir="rtl" className="arabic-display alphabet-title">
          {lesson.letters.map((l) => l.char).join(' ')}
        </h1>
        <p style={{ margin: 0, fontWeight: 600 }}>{lesson.title}</p>
        <p className="muted" style={{ margin: 0 }}>
          {lesson.hint}
        </p>
        <div className="row" style={{ gap: '0.75rem', flexWrap: 'nowrap' }}>
          <div
            className="review-progress"
            role="progressbar"
            aria-label={`Fortschritt Lektion ${lesson.no}`}
            aria-valuemin={0}
            aria-valuemax={progress.total}
            aria-valuenow={progress.done}
          >
            <div style={{ width: `${(progress.done / progress.total) * 100}%` }} />
          </div>
          <span className="muted" style={{ whiteSpace: 'nowrap' }}>
            {progress.done} von {progress.total}
          </span>
        </div>
      </header>

      <div className="alphabet-letters" role="group" aria-label="Buchstaben">
        {lesson.letters.map((letter) => (
          <button
            key={letter.id}
            className={`btn alphabet-letter${letter.id === selected.id ? ' btn-accent' : ''}`}
            aria-pressed={letter.id === selected.id}
            aria-label={letter.name}
            onClick={() => {
              setSelected(letter);
              speakArabic(letter.nameAr);
            }}
          >
            <span lang="ar" className="arabic-inline">
              {letter.char}
            </span>
          </button>
        ))}
      </div>
      <LetterCard letter={selected} />

      <h2 className="eyebrow" style={{ margin: 0 }}>
        Üben
      </h2>
      <TaskQueue
        ids={items}
        isDone={isDone}
        complete={
          <div
            className="card stack"
            style={{ alignItems: 'center', textAlign: 'center' }}
          >
            <strong className="feedback-good">✓ Lektion {lesson.no} geschafft</strong>
            <Link
              to={next ? `/alphabet/${next.no}` : '/units/1'}
              className="btn btn-primary"
            >
              {next ? `Weiter: Lektion ${next.no}` : 'Weiter zu Einheit 1'}
            </Link>
          </div>
        }
      >
        {(item, position, nextTask) => (
          <LetterQuestion
            key={item}
            item={item}
            lesson={lesson}
            position={position}
            onCorrect={() => markDone(item)}
            onNext={nextTask}
          />
        )}
      </TaskQueue>
    </div>
  );
}

function LetterCard({ letter }: { letter: Letter }) {
  return (
    <section className="card stack" aria-label={`Buchstabe ${letter.name}`}>
      <div
        className="row"
        style={{ justifyContent: 'space-between', flexWrap: 'nowrap' }}
      >
        <span className="stack" style={{ gap: '0.15rem' }}>
          <strong style={{ fontSize: '1.2rem' }}>{letter.name}</strong>
          <span className="muted">Laut: {letter.sound}</span>
          {!letter.connects && letter.forms && (
            <span className="muted" style={{ fontSize: '0.9rem' }}>
              Verbindet sich nicht mit dem nächsten Buchstaben.
            </span>
          )}
        </span>
        <button
          type="button"
          className="icon-button"
          onClick={() => speakArabic(letter.nameAr)}
          aria-label={`${letter.name} anhören`}
        >
          <Icon name="volume" size={20} />
        </button>
      </div>
      <ul className="alphabet-forms" aria-label="Formen">
        {letterForms(letter).map(({ form, text }) => (
          <li key={form}>
            <span lang="ar" dir="rtl" className="arabic-inline alphabet-form">
              {text}
            </span>
            <span className="muted">{form}</span>
          </li>
        ))}
      </ul>
      <button
        type="button"
        className="grammar-example"
        onClick={() => speakArabic(letter.example.ar)}
        aria-label={`Beispiel ${letter.example.de} anhören`}
      >
        <span
          lang="ar"
          dir="rtl"
          className="arabic-inline"
          style={{ fontSize: '1.6rem' }}
        >
          {letter.example.ar}
        </span>
        <span className="muted">{letter.example.de}</span>
      </button>
    </section>
  );
}

/** Distractors: other letters of the lesson first (they look alike), then from the rest. */
function choicesFor(letter: Letter, lesson: AlphabetLesson): Letter[] {
  const same = lesson.letters.filter((l) => l.id !== letter.id);
  const rest = ALL_LETTERS.filter(
    (l) => l.id !== letter.id && !same.includes(l) && l.forms === letter.forms
  );
  const pool = [
    ...stableShuffle(same, letter.id, (l) => l.id),
    ...stableShuffle(rest, letter.id, (l) => l.id),
  ].slice(0, CHOICES - 1);
  return stableShuffle([...pool, letter], `${letter.id}|choices`, (l) => l.id);
}

function LetterQuestion({
  item,
  lesson,
  position,
  onCorrect,
  onNext,
}: {
  item: string;
  lesson: AlphabetLesson;
  position: string;
  onCorrect(): void;
  onNext(): void;
}) {
  const parsed = parseItem(item)!;
  const { kind, letter } = parsed;
  const choices = useMemo(() => choicesFor(letter, lesson), [letter, lesson]);
  // "See" shows one of the letter's forms, so the learner meets them joined as well.
  const shown = useMemo(() => {
    const forms = letterForms(letter);
    return stableShuffle(forms, item, (f) => f.form)[0]!.text;
  }, [letter, item]);
  const [wrong, setWrong] = useState<ReadonlySet<string>>(() => new Set());
  const [correct, setCorrect] = useState(false);

  const pick = (choice: Letter) => {
    if (correct) return;
    if (choice.id === letter.id) {
      setCorrect(true);
      onCorrect();
      speakArabic(letter.nameAr);
    } else {
      setWrong((prev) => new Set(prev).add(choice.id));
    }
  };

  return (
    <div className="card stack">
      <p className="muted" style={{ margin: 0 }}>
        {kind === 'see' ? 'Welcher Buchstabe ist das?' : 'Wo ist dieser Buchstabe?'} ·{' '}
        {position}
      </p>
      {kind === 'see' ? (
        <p lang="ar" dir="rtl" className="arabic alphabet-prompt">
          {shown}
        </p>
      ) : (
        <p className="alphabet-prompt-name">
          <strong>{letter.name}</strong>
          <span className="muted"> · {letter.sound}</span>
        </p>
      )}
      <div
        className={kind === 'see' ? 'grammar-options' : 'cloze-choices'}
        role="group"
        aria-label="Auswahl"
      >
        {choices.map((choice) => (
          <button
            key={choice.id}
            lang={kind === 'find' ? 'ar' : undefined}
            className={`btn ${kind === 'find' ? 'cloze-choice arabic-inline' : 'grammar-option'}${
              correct && choice.id === letter.id ? ' btn-accent' : ''
            }${wrong.has(choice.id) ? ' cloze-choice-wrong' : ''}`}
            disabled={wrong.has(choice.id) || (correct && choice.id !== letter.id)}
            aria-label={kind === 'find' ? choice.name : undefined}
            onClick={() => pick(choice)}
          >
            {kind === 'find' ? choice.char : choice.name}
          </button>
        ))}
      </div>
      {correct ? (
        <>
          <span className="feedback-good">
            ✓ Richtig – {letter.name} ({letter.sound})
          </span>
          <button className="btn btn-primary" onClick={onNext}>
            Weiter
          </button>
        </>
      ) : (
        <>
          {wrong.size > 0 && (
            <span className="feedback-bad">
              Nicht ganz – schau dir die Punkte genau an.
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
