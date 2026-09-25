/**
 * Live class quiz (story 14.4): one page, two faces. The teacher's is the projector view with
 * the controls (start, reveal, next, end); a learner's is the phone view with four big
 * answer buttons. Both follow the server through its event stream. Words a learner missed
 * become due cards right away, so the quiz feeds the spaced repetition.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ClassesApi } from '@/services/classes/classesApi';
import { QuizApi, type QuizView } from '@/services/classes/quizApi';
import { useSrsStore, useSyncStore } from '@/state';

const SHAPES = ['▲', '◆', '●', '■'];

export function LiveQuiz() {
  const { id = '' } = useParams();
  const signedIn = useSyncStore((s) => s.auth.status === 'signed-in');
  const classes = useMemo(() => new ClassesApi(), []);
  const api = useMemo(() => new QuizApi(), []);
  const [role, setRole] = useState<'teacher' | 'student' | null | undefined>(undefined);
  const quiz = useQuizState(api, id, signedIn && role !== undefined && role !== null);

  useEffect(() => {
    if (!signedIn) return;
    void classes.list().then((result) => {
      const summary = result.ok
        ? result.value.classes.find((c) => c.id === id)
        : undefined;
      setRole(summary && summary.status === 'active' ? summary.classRole : null);
    });
  }, [classes, id, signedIn]);

  if (!signedIn) return <p className="muted">Bitte melde dich unter Einstellungen an.</p>;
  if (role === undefined) return <p className="muted">Lade Quiz …</p>;
  if (role === null) {
    return (
      <p className="muted">
        Diese Klasse gibt es nicht oder du bist (noch) nicht freigegeben.{' '}
        <Link to="/classes">Zu deinen Klassen</Link>
      </p>
    );
  }
  return (
    <div className="stack quiz-page" style={{ gap: '1rem' }}>
      <Link to={`/classes/${id}`} className="muted">
        ← Zur Klasse
      </Link>
      {role === 'teacher' ? (
        <TeacherQuiz api={api} classId={id} quiz={quiz} />
      ) : (
        <LearnerQuiz api={api} classId={id} quiz={quiz} />
      )}
    </div>
  );
}

/** The current view: fetched once, then pushed by the event stream. */
function useQuizState(api: QuizApi, classId: string, enabled: boolean) {
  const [quiz, setQuiz] = useState<QuizView | null | undefined>(undefined);
  useEffect(() => {
    if (!enabled) return;
    const abort = new AbortController();
    void api.view(classId).then((r) => {
      if (r.ok && !abort.signal.aborted) setQuiz(r.value.quiz);
    });
    void (async () => {
      for await (const view of api.events(classId, abort.signal)) setQuiz(view);
    })();
    return () => abort.abort();
  }, [api, classId, enabled]);
  return quiz;
}

/** Seconds left for the open question (display only; the server decides what is late). */
function useCountdown(quiz: QuizView | null | undefined): number | null {
  const [now, setNow] = useState(() => Date.now());
  const open = quiz?.status === 'question' && quiz.questionStartedAt;
  useEffect(() => {
    if (!open) return;
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, [open]);
  if (!open) return null;
  const end = Date.parse(quiz.questionStartedAt!) + quiz.questionSeconds * 1000;
  return Math.max(0, Math.ceil((end - now) / 1000));
}

type ActionResult = { ok: boolean; message?: string };

function useAction() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const run = useCallback(async (action: () => Promise<ActionResult>) => {
    setBusy(true);
    try {
      const result = await action();
      setMessage(result.ok ? null : (result.message ?? null));
    } finally {
      setBusy(false);
    }
  }, []);
  return { busy, message, run };
}

function TeacherQuiz({
  api,
  classId,
  quiz,
}: {
  api: QuizApi;
  classId: string;
  quiz: QuizView | null | undefined;
}) {
  const { busy, message, run } = useAction();
  const seconds = useCountdown(quiz);
  const running = quiz && quiz.status !== 'finished';

  return (
    <section className="card stack quiz-stage" aria-label="Live-Quiz (Beamer)">
      <header className="row" style={{ justifyContent: 'space-between' }}>
        <h1 style={{ margin: 0 }}>Live-Quiz</h1>
        {quiz && running && (
          <span className="muted">
            {quiz.current >= 0
              ? `Frage ${quiz.current + 1} von ${quiz.questionCount} · `
              : ''}
            {quiz.players} dabei
          </span>
        )}
      </header>

      {!running && (
        <div className="stack">
          <p className="muted" style={{ margin: 0 }}>
            Fragen aus den Problemwörtern der Klasse, ergänzt aus den erreichten
            Einheiten. Die Lernenden öffnen die Klasse auf dem Handy und tippen auf
            „Mitmachen“.
          </p>
          {quiz?.status === 'finished' && <Leaderboard entries={quiz.leaderboard} />}
          <button
            className="btn btn-primary"
            disabled={busy}
            onClick={() => void run(() => api.create(classId))}
          >
            {quiz?.status === 'finished' ? 'Neues Quiz starten' : 'Quiz starten'}
          </button>
        </div>
      )}

      {quiz?.status === 'lobby' && (
        <div className="stack">
          <p className="quiz-big">{quiz.players} Lernende sind dabei.</p>
          <button
            className="btn btn-primary"
            disabled={busy}
            onClick={() => void run(() => api.next(classId))}
          >
            Erste Frage zeigen
          </button>
        </div>
      )}

      {quiz?.question && (quiz.status === 'question' || quiz.status === 'reveal') && (
        <div className="stack">
          <p className="quiz-prompt" lang="ar" dir="rtl">
            {quiz.question.prompt}
          </p>
          <Options quiz={quiz} />
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <span className="muted">
              {quiz.answered} von {quiz.players} geantwortet
              {seconds !== null && ` · noch ${seconds} s`}
            </span>
            {quiz.status === 'question' ? (
              <button
                className="btn btn-primary"
                disabled={busy}
                onClick={() => void run(() => api.reveal(classId))}
              >
                Auflösen
              </button>
            ) : (
              <button
                className="btn btn-primary"
                disabled={busy}
                onClick={() => void run(() => api.next(classId))}
              >
                {quiz.current + 1 < quiz.questionCount
                  ? 'Nächste Frage'
                  : 'Ergebnis zeigen'}
              </button>
            )}
          </div>
          {quiz.status === 'reveal' && <Leaderboard entries={quiz.leaderboard} />}
        </div>
      )}

      {running && (
        <button
          className="btn btn-small"
          disabled={busy}
          onClick={() => void run(() => api.finish(classId))}
          style={{ alignSelf: 'flex-start' }}
        >
          Quiz beenden
        </button>
      )}
      {message && <p className="feedback-bad">{message}</p>}
    </section>
  );
}

function LearnerQuiz({
  api,
  classId,
  quiz,
}: {
  api: QuizApi;
  classId: string;
  quiz: QuizView | null | undefined;
}) {
  const { busy, message, run } = useAction();
  const seconds = useCountdown(quiz);
  const prioritise = useSrsStore((s) => s.prioritise);
  const fed = useRef(new Set<string>());

  // A missed or unanswered word becomes due again (once per question).
  useEffect(() => {
    if (quiz?.status !== 'reveal' || !quiz.question || !quiz.you?.joined) return;
    const key = `${quiz.id}:${quiz.question.index}`;
    if (fed.current.has(key)) return;
    fed.current.add(key);
    if (quiz.you.answer?.correct !== true) void prioritise([quiz.question.wordId]);
  }, [quiz, prioritise]);

  if (quiz === undefined) return <p className="muted">Lade Quiz …</p>;
  if (quiz === null) {
    return <p className="muted">Gerade läuft kein Quiz. Deine Lehrkraft startet es.</p>;
  }
  if (!quiz.you?.joined && quiz.status !== 'finished') {
    return (
      <section className="card stack" aria-label="Live-Quiz">
        <h1 style={{ margin: 0 }}>Live-Quiz</h1>
        <p className="muted" style={{ margin: 0 }}>
          {quiz.players} sind schon dabei.
        </p>
        <button
          className="btn btn-primary"
          disabled={busy}
          onClick={() => void run(() => api.join(classId))}
        >
          Mitmachen
        </button>
        {message && <p className="feedback-bad">{message}</p>}
      </section>
    );
  }

  const answer = quiz.you?.answer ?? null;
  return (
    <section className="card stack" aria-label="Live-Quiz">
      <header className="row" style={{ justifyContent: 'space-between' }}>
        <strong>
          {quiz.current >= 0 && quiz.status !== 'finished'
            ? `Frage ${quiz.current + 1} von ${quiz.questionCount}`
            : 'Live-Quiz'}
        </strong>
        <span>{quiz.you?.points ?? 0} Punkte</span>
      </header>

      {quiz.status === 'lobby' && (
        <p className="quiz-big">Du bist dabei. Gleich geht es los …</p>
      )}

      {quiz.question && quiz.status === 'question' && (
        <div className="stack">
          <p className="quiz-prompt" lang="ar" dir="rtl">
            {quiz.question.prompt}
          </p>
          {answer ? (
            <p className="quiz-big">Antwort gespeichert – warte auf die Auflösung.</p>
          ) : (
            <div className="quiz-options" role="group" aria-label="Antworten">
              {quiz.question.options.map((option, i) => (
                <button
                  key={option}
                  className={`quiz-option quiz-option-${i}`}
                  disabled={busy || seconds === 0}
                  onClick={() =>
                    void run(() => api.answer(classId, quiz.question!.index, i))
                  }
                >
                  <span aria-hidden>{SHAPES[i]}</span> {option}
                </button>
              ))}
            </div>
          )}
          {seconds !== null && <span className="muted">noch {seconds} s</span>}
        </div>
      )}

      {quiz.question && quiz.status === 'reveal' && (
        <div className="stack">
          <p
            className={
              answer?.correct ? 'feedback-good quiz-big' : 'feedback-bad quiz-big'
            }
          >
            {answer?.correct
              ? 'Richtig!'
              : answer
                ? 'Leider falsch – das Wort kommt heute noch einmal dran.'
                : 'Keine Antwort – das Wort kommt heute noch einmal dran.'}
          </p>
          <p style={{ margin: 0 }}>
            <span lang="ar" dir="rtl" className="arabic-inline">
              {quiz.question.prompt}
            </span>{' '}
            = <strong>{quiz.question.options[quiz.question.correct ?? 0]}</strong>
          </p>
          <Leaderboard entries={quiz.leaderboard} />
        </div>
      )}

      {quiz.status === 'finished' && (
        <div className="stack">
          <p className="quiz-big">Geschafft! Du hast {quiz.you?.points ?? 0} Punkte.</p>
          <Leaderboard entries={quiz.leaderboard} />
        </div>
      )}
      {message && <p className="feedback-bad">{message}</p>}
    </section>
  );
}

function Options({ quiz }: { quiz: QuizView }) {
  const q = quiz.question!;
  const revealed = quiz.status === 'reveal';
  return (
    <ol className="quiz-options" aria-label="Antworten">
      {q.options.map((option, i) => (
        <li
          key={option}
          className={`quiz-option quiz-option-${i}${revealed && q.correct === i ? ' quiz-option-correct' : ''}${revealed && q.correct !== i ? ' quiz-option-dim' : ''}`}
        >
          <span aria-hidden>{SHAPES[i]}</span> {option}
          {revealed && q.distribution && (
            <span className="quiz-count"> · {q.distribution[i]}</span>
          )}
        </li>
      ))}
    </ol>
  );
}

function Leaderboard({ entries }: { entries: QuizView['leaderboard'] }) {
  if (entries.length === 0) return null;
  return (
    <ol className="feed-list" aria-label="Bestenliste">
      {entries.map((e, i) => (
        <li
          key={`${i}-${e.name}`}
          className={`feed-item row${e.you ? ' feed-item-you' : ''}`}
          style={{ justifyContent: 'space-between' }}
        >
          <span>
            {i + 1}. {e.you ? 'Du' : e.name}
          </span>
          <span>{e.points}</span>
        </li>
      ))}
    </ol>
  );
}
