/**
 * Grade mode (story 11.1): the learner writes a text (or speaks it: the browser's speech
 * recognition turns it into a transcript) and al-Muʿallim grades it with a rubric, a corrected
 * version and the mistakes; mistakes that are course words can be brought up for review.
 */
import { useState } from 'react';
import { ArabicText } from '@/components';
import { isRecognitionSupported, recognizeOnce } from '@/services/speech/recognition';
import {
  MISTAKE_LABELS,
  type Grade,
  type GradeKind,
  type TutorApi,
} from '@/services/tutor/tutorApi';
import { useSrsStore } from '@/state';
import { TutorText } from './TutorText';

const RUBRIC_LABELS: Record<keyof Grade['rubric'], string> = {
  task: 'Aufgabe',
  grammar: 'Grammatik',
  vocabulary: 'Wortschatz',
  spelling: 'Schreibung',
};

const PROMPTS = [
  'Stell dich vor: Name, Herkunft, Wohnort.',
  'Beschreibe deine Familie in drei Sätzen.',
  'Was machst du an einem normalen Tag?',
];

export function GradePanel({ api, disabled }: { api: TutorApi; disabled: boolean }) {
  const [kind, setKind] = useState<GradeKind>('writing');
  const [task, setTask] = useState(PROMPTS[0]!);
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
      setMessage(
        'Ich habe nichts verstanden. Versuch es noch einmal oder tippe den Text.'
      );
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
          aria-label="Art des Textes"
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
              {k === 'writing' ? 'Geschrieben' : 'Gesprochen'}
            </button>
          ))}
        </div>
        <label className="stack" style={{ gap: 4 }}>
          <span className="muted">Aufgabe</span>
          <input
            className="input"
            list="grade-prompts"
            value={task}
            maxLength={500}
            onChange={(e) => setTask(e.target.value)}
          />
          <datalist id="grade-prompts">
            {PROMPTS.map((p) => (
              <option key={p} value={p} />
            ))}
          </datalist>
        </label>
        <label className="stack" style={{ gap: 4 }}>
          <span className="muted">
            {kind === 'writing'
              ? 'Dein Text auf Arabisch'
              : 'Was du gesagt hast (Transkript)'}
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
              {listening ? 'Ich höre zu …' : '🎙 Sprechen'}
            </button>
          )}
          <button
            className="btn btn-primary"
            type="submit"
            disabled={disabled || busy || !answer.trim()}
          >
            {busy ? 'Bewerte …' : 'Bewerten lassen'}
          </button>
          {message && <span className="feedback-bad">{message}</span>}
        </div>
      </form>
      {grade && <GradeCard grade={grade} />}
    </div>
  );
}

export function GradeCard({ grade }: { grade: Grade }) {
  const prioritise = useSrsStore((s) => s.prioritise);
  const [moved, setMoved] = useState<number | null>(null);
  const words = [...new Set(grade.mistakes.flatMap((m) => (m.wordId ? [m.wordId] : [])))];
  const score = grade.override?.score ?? grade.score;

  return (
    <section className="card stack" aria-label="Bewertung">
      <div className="row" style={{ gap: '1rem', alignItems: 'center' }}>
        <div className="grade-score" aria-label={`${score} von 100 Punkten`}>
          {score}
        </div>
        <div className="stack" style={{ gap: 4, flex: 1 }}>
          {(Object.keys(RUBRIC_LABELS) as (keyof Grade['rubric'])[]).map((k) => (
            <div key={k} className="row" style={{ gap: '0.5rem' }}>
              <span className="muted" style={{ width: '6.5rem' }}>
                {RUBRIC_LABELS[k]}
              </span>
              <span aria-label={`${RUBRIC_LABELS[k]}: ${grade.rubric[k]} von 4`}>
                {'●'.repeat(grade.rubric[k])}
                <span className="muted">{'○'.repeat(4 - grade.rubric[k])}</span>
              </span>
            </div>
          ))}
        </div>
      </div>
      {grade.override && (
        <p className="badge" style={{ alignSelf: 'flex-start' }}>
          Von deiner Lehrkraft angepasst
          {grade.override.comment ? `: ${grade.override.comment}` : ''}
        </p>
      )}
      <TutorText text={grade.summary} />
      <div className="stack" style={{ gap: 4 }}>
        <strong>Verbessert</strong>
        <ArabicText size="lg">{grade.override?.corrected ?? grade.corrected}</ArabicText>
      </div>
      {grade.mistakes.length > 0 && (
        <div className="stack" style={{ gap: '0.5rem' }}>
          <strong>Fehler ({grade.mistakes.length})</strong>
          <ul className="grade-mistakes">
            {grade.mistakes.map((m, i) => (
              <li key={i}>
                <span className="badge">{MISTAKE_LABELS[m.category]}</span>{' '}
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
            {words.length === 1
              ? 'Dieses Wort jetzt wiederholen'
              : `${words.length} Wörter jetzt wiederholen`}
          </button>
          {moved !== null && (
            <span className="muted">
              {moved > 0
                ? 'Die Karten sind jetzt fällig.'
                : 'Die Karten sind schon fällig.'}
            </span>
          )}
        </div>
      )}
    </section>
  );
}
