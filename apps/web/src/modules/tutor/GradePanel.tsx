/**
 * Grade mode (story 11.1): the learner writes a text (or speaks it: the browser's speech
 * recognition turns it into a transcript) and al-Muʿallim grades it with a rubric, a corrected
 * version and the mistakes; mistakes that are course words can be brought up for review.
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArabicText } from '@/components';
import { isRecognitionSupported, recognizeOnce } from '@/services/speech/recognition';
import type { Grade, GradeKind, TutorApi } from '@/services/tutor/tutorApi';
import { useSrsStore } from '@/state';
import { TutorText } from './TutorText';

/** Rubric rows in order; labels are `tutor:grade.rubric.<key>`. */
const RUBRIC: (keyof Grade['rubric'])[] = ['task', 'grammar', 'vocabulary', 'spelling'];

/** Suggested tasks: `tutor:grade.prompts.<key>`. */
const PROMPTS = ['introduce', 'family', 'day'] as const;

export function GradePanel({ api, disabled }: { api: TutorApi; disabled: boolean }) {
  const { t } = useTranslation('tutor');
  const [kind, setKind] = useState<GradeKind>('writing');
  const [task, setTask] = useState<string>(() => t('grade.prompts.introduce'));
  const [answer, setAnswer] = useState('');
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [grade, setGrade] = useState<Grade | null>(null);

  const listen = async () => {
    setListening(true);
    setMessage(null);
    const outcome = await recognizeOnce({ target: '', timeoutMs: 20_000 });
    setListening(false);
    if (outcome.ok) {
      setAnswer((a) =>
        [a.trim(), outcome.result.transcript.trim()].filter(Boolean).join(' ')
      );
    } else {
      setMessage(t('grade.notUnderstood'));
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    const result = await api.grade({ kind, task, answer });
    setBusy(false);
    if (!result.ok) return setMessage(result.message);
    setGrade(result.value);
  };

  return (
    <div className="stack">
      <form className="card stack" onSubmit={(e) => void submit(e)}>
        <div
          className="row"
          role="radiogroup"
          aria-label={t('grade.kindGroup')}
          style={{ gap: '0.5rem' }}
        >
          {(['writing', 'speech'] as const).map((k) => (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={kind === k}
              className={`btn ${kind === k ? 'btn-primary' : ''}`}
              onClick={() => setKind(k)}
            >
              {k === 'writing' ? t('grade.writing') : t('grade.speech')}
            </button>
          ))}
        </div>
        <label className="stack" style={{ gap: 4 }}>
          <span className="muted">{t('grade.task')}</span>
          <input
            className="input"
            list="grade-prompts"
            value={task}
            maxLength={500}
            onChange={(e) => setTask(e.target.value)}
          />
          <datalist id="grade-prompts">
            {PROMPTS.map((p) => (
              <option key={p} value={t(`grade.prompts.${p}`)} />
            ))}
          </datalist>
        </label>
        <label className="stack" style={{ gap: 4 }}>
          <span className="muted">
            {kind === 'writing' ? t('grade.yourText') : t('grade.transcript')}
          </span>
          <textarea
            className="input arabic"
            dir="rtl"
            lang="ar"
            rows={4}
            maxLength={3000}
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
          />
        </label>
        <div className="row" style={{ flexWrap: 'wrap', gap: '0.5rem' }}>
          {kind === 'speech' && isRecognitionSupported() && (
            <button
              className="btn"
              type="button"
              disabled={listening}
              onClick={() => void listen()}
            >
              {listening ? t('grade.listening') : t('grade.speak')}
            </button>
          )}
          <button
            className="btn btn-primary"
            type="submit"
            disabled={disabled || busy || !answer.trim()}
          >
            {busy ? t('grade.grading') : t('grade.submit')}
          </button>
          {message && <span className="feedback-bad">{message}</span>}
        </div>
      </form>
      {grade && <GradeCard grade={grade} />}
    </div>
  );
}

export function GradeCard({ grade }: { grade: Grade }) {
  const { t } = useTranslation('tutor');
  const prioritise = useSrsStore((s) => s.prioritise);
  const [moved, setMoved] = useState<number | null>(null);
  const words = [...new Set(grade.mistakes.flatMap((m) => (m.wordId ? [m.wordId] : [])))];
  const score = grade.override?.score ?? grade.score;

  return (
    <section className="card stack" aria-label={t('grade.result')}>
      <div className="row" style={{ gap: '1rem', alignItems: 'center' }}>
        <div className="grade-score" aria-label={t('grade.score', { score })}>
          {score}
        </div>
        <div className="stack" style={{ gap: 4, flex: 1 }}>
          {RUBRIC.map((k) => (
            <div key={k} className="row" style={{ gap: '0.5rem' }}>
              <span className="muted" style={{ width: '6.5rem' }}>
                {t(`grade.rubric.${k}`)}
              </span>
              <span
                aria-label={t('grade.rubricScore', {
                  label: t(`grade.rubric.${k}`),
                  value: grade.rubric[k],
                })}
              >
                {'●'.repeat(grade.rubric[k])}
                <span className="muted">{'○'.repeat(4 - grade.rubric[k])}</span>
              </span>
            </div>
          ))}
        </div>
      </div>
      {grade.override && (
        <p className="badge" style={{ alignSelf: 'flex-start' }}>
          {grade.override.comment
            ? t('grade.adjustedComment', { comment: grade.override.comment })
            : t('grade.adjusted')}
        </p>
      )}
      <TutorText text={grade.summary} />
      <div className="stack" style={{ gap: 4 }}>
        <strong>{t('grade.corrected')}</strong>
        <ArabicText size="lg">{grade.override?.corrected ?? grade.corrected}</ArabicText>
      </div>
      {grade.mistakes.length > 0 && (
        <div className="stack" style={{ gap: '0.5rem' }}>
          <strong>{t('grade.mistakesTitle', { number: grade.mistakes.length })}</strong>
          <ul className="grade-mistakes">
            {grade.mistakes.map((m, i) => (
              <li key={i}>
                <span className="badge">{t(`grade.mistakes.${m.category}`)}</span>{' '}
                <s>
                  <ArabicText>{m.original}</ArabicText>
                </s>{' '}
                → <ArabicText>{m.correction}</ArabicText>
                <div className="muted">
                  <TutorText text={m.explanation} />
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
      {words.length > 0 && (
        <div className="row" style={{ gap: '0.5rem', flexWrap: 'wrap' }}>
          <button
            className="btn"
            type="button"
            disabled={moved !== null}
            onClick={() => void prioritise(words).then(setMoved)}
          >
            {t('grade.reviewWords', { count: words.length })}
          </button>
          {moved !== null && (
            <span className="muted">
              {moved > 0 ? t('grade.nowDue') : t('grade.alreadyDue')}
            </span>
          )}
        </div>
      )}
    </section>
  );
}
