/**
 * Live class quiz (story 14.4): one page, two faces. The teacher's is the projector view with
 * the controls (start, reveal, next, end); a learner's is the phone view with four big
 * answer buttons. Both follow the server through its event stream. Words a learner missed
 * become due cards right away, so the quiz feeds the spaced repetition.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import { ClassesApi } from '@/services/classes/classesApi';
import { QuizApi, type QuizView } from '@/services/classes/quizApi';
import { useSrsStore, useSyncStore } from '@/state';

const SHAPES = ['▲', '◆', '●', '■'];

export function LiveQuiz() {
  const { t } = useTranslation(['quiz', 'classes']);
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

  if (!signedIn) return <p className="muted">{t('classes:signInFirst')}</p>;
  if (role === undefined) return <p className="muted">{t('loading')}</p>;
  if (role === null) {
    return (
      <p className="muted">
        {t('classes:notFound')} <Link to="/classes">{t('classes:toYourClasses')}</Link>
      </p>
    );
  }
  return (
    <div className="stack quiz-page" style={{ gap: '1rem' }}>
      <Link to={`/classes/${id}`} className="muted">
        {t('classes:backToClass')}
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
      if (r.ok && !abort.signal.aborted) setQuiz(r.value?.quiz ?? null);
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
  const { t } = useTranslation('quiz');
  const { busy, message, run } = useAction();
  const seconds = useCountdown(quiz);
  const running = quiz && quiz.status !== 'finished';

  return (
    <section className="card stack quiz-stage" aria-label={t('stage')}>
      <header className="row" style={{ justifyContent: 'space-between' }}>
        <h1 style={{ margin: 0 }}>{t('title')}</h1>
        {quiz && running && (
          <span className="muted">
            {quiz.current >= 0
              ? `${t('questionOf', { number: quiz.current + 1, total: quiz.questionCount })} · `
              : ''}
            {t('players', { count: quiz.players })}
          </span>
        )}
      </header>

      {!running && (
        <div className="stack">
          <p className="muted" style={{ margin: 0 }}>
            {t('intro')}
          </p>
          {quiz?.status === 'finished' && <Leaderboard entries={quiz.leaderboard} />}
          <button
            className="btn btn-primary"
            disabled={busy}
            onClick={() => void run(() => api.create(classId))}
          >
            {quiz?.status === 'finished' ? t('startNew') : t('start')}
          </button>
        </div>
      )}

      {quiz?.status === 'lobby' && (
        <div className="stack">
          <p className="quiz-big">{t('lobby', { count: quiz.players })}</p>
          <button
            className="btn btn-primary"
            disabled={busy}
            onClick={() => void run(() => api.next(classId))}
          >
            {t('firstQuestion')}
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
              {t('answered', { answered: quiz.answered, players: quiz.players })}
              {seconds !== null && ` · ${t('secondsLeft', { seconds })}`}
            </span>
            {quiz.status === 'question' ? (
              <button
                className="btn btn-primary"
                disabled={busy}
                onClick={() => void run(() => api.reveal(classId))}
              >
                {t('reveal')}
              </button>
            ) : (
              <button
                className="btn btn-primary"
                disabled={busy}
                onClick={() => void run(() => api.next(classId))}
              >
                {quiz.current + 1 < quiz.questionCount ? t('next') : t('results')}
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
          {t('finish')}
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
  const { t } = useTranslation('quiz');
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

  if (quiz === undefined) return <p className="muted">{t('loading')}</p>;
  if (quiz === null) {
    return <p className="muted">{t('noQuiz')}</p>;
  }
  if (!quiz.you?.joined && quiz.status !== 'finished') {
    return (
      <section className="card stack" aria-label={t('title')}>
        <h1 style={{ margin: 0 }}>{t('title')}</h1>
        <p className="muted" style={{ margin: 0 }}>
          {t('alreadyIn', { count: quiz.players })}
        </p>
        <button
          className="btn btn-primary"
          disabled={busy}
          onClick={() => void run(() => api.join(classId))}
        >
          {t('join')}
        </button>
        {message && <p className="feedback-bad">{message}</p>}
      </section>
    );
  }

  const answer = quiz.you?.answer ?? null;
  return (
    <section className="card stack" aria-label={t('title')}>
      <header className="row" style={{ justifyContent: 'space-between' }}>
        <strong>
          {quiz.current >= 0 && quiz.status !== 'finished'
            ? t('questionOf', { number: quiz.current + 1, total: quiz.questionCount })
            : t('title')}
        </strong>
        <span>{t('points', { count: quiz.you?.points ?? 0 })}</span>
      </header>

      {quiz.status === 'lobby' && <p className="quiz-big">{t('inLobby')}</p>}

      {quiz.question && quiz.status === 'question' && (
        <div className="stack">
          <p className="quiz-prompt" lang="ar" dir="rtl">
            {quiz.question.prompt}
          </p>
          {answer ? (
            <p className="quiz-big">{t('saved')}</p>
          ) : (
            <div className="quiz-options" role="group" aria-label={t('answers')}>
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
          {seconds !== null && (
            <span className="muted">{t('secondsLeft', { seconds })}</span>
          )}
        </div>
      )}

      {quiz.question && quiz.status === 'reveal' && (
        <div className="stack">
          <p
            className={
              answer?.correct ? 'feedback-good quiz-big' : 'feedback-bad quiz-big'
            }
          >
            {answer?.correct ? t('correct') : answer ? t('wrong') : t('noAnswer')}
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
          <p className="quiz-big">{t('finished', { count: quiz.you?.points ?? 0 })}</p>
          <Leaderboard entries={quiz.leaderboard} />
        </div>
      )}
      {message && <p className="feedback-bad">{message}</p>}
    </section>
  );
}

function Options({ quiz }: { quiz: QuizView }) {
  const { t } = useTranslation('quiz');
  const q = quiz.question!;
  const revealed = quiz.status === 'reveal';
  return (
    <ol className="quiz-options" aria-label={t('answers')}>
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
  const { t } = useTranslation('quiz');
  if (entries.length === 0) return null;
  return (
    <ol className="feed-list" aria-label={t('leaderboard')}>
      {entries.map((e, i) => (
        <li
          key={`${i}-${e.name}`}
          className={`feed-item row${e.you ? ' feed-item-you' : ''}`}
          style={{ justifyContent: 'space-between' }}
        >
          <span>
            {i + 1}. {e.you ? t('you') : e.name}
          </span>
          <span>{e.points}</span>
        </li>
      ))}
    </ol>
  );
}
