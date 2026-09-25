/**
 * The teacher's review of AI grades (story 11.2): open grades of the class with the model's
 * rubric; "passt" confirms, "anpassen" overrides score and comment. Reviewed grades can be
 * exported as eval cases (without names) to keep the grading prompt honest (story 11.3).
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArabicText } from '@/components';
import { ReviewApi, type ReviewItem } from '@/services/tutor/reviewApi';
import { MISTAKE_LABELS } from '@/services/tutor/tutorApi';

export function ClassGrades({
  classId,
  api: injected,
}: {
  classId: string;
  api?: ReviewApi;
}) {
  const api = useMemo(() => injected ?? new ReviewApi(), [injected]);
  const [status, setStatus] = useState<'open' | 'reviewed'>('open');
  const [items, setItems] = useState<ReviewItem[] | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    const result = await api.queue(classId, status);
    if (result.ok) setItems(result.value.grades);
    else setMessage(result.message);
  }, [api, classId, status]);

  useEffect(() => {
    void load();
  }, [load]);

  const download = async () => {
    const result = await api.exportCases(classId);
    if (!result.ok) return setMessage(result.message);
    const blob = new Blob([JSON.stringify(result.value, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'suffa-bewertungen-evals.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="stack">
      <p className="muted" style={{ margin: 0 }}>
        Texte, die al-Muʿallim bewertet hat. Bestätige oder passe die Bewertung an – deine
        Urteile machen die KI-Bewertung besser.
      </p>
      <div className="row" style={{ gap: '0.5rem', flexWrap: 'wrap' }}>
        {(['open', 'reviewed'] as const).map((s) => (
          <button
            key={s}
            type="button"
            className={`btn ${status === s ? 'btn-primary' : ''}`}
            aria-pressed={status === s}
            onClick={() => setStatus(s)}
          >
            {s === 'open' ? 'Offen' : 'Geprüft'}
          </button>
        ))}
        {status === 'reviewed' && items && items.length > 0 && (
          <button type="button" className="btn" onClick={() => void download()}>
            Als Eval-Fälle exportieren
          </button>
        )}
      </div>
      {message && <span className="feedback-bad">{message}</span>}
      {items?.length === 0 && (
        <p className="muted">
          {status === 'open' ? 'Nichts zu prüfen.' : 'Noch keine geprüften Bewertungen.'}
        </p>
      )}
      {items?.map((g) => (
        <GradeReview
          key={g.id}
          item={g}
          onVerdict={async (verdict) => {
            const result = await api.review(classId, g.id, verdict);
            if (!result.ok) return setMessage(result.message);
            await load();
          }}
        />
      ))}
    </div>
  );
}

function GradeReview({
  item,
  onVerdict,
}: {
  item: ReviewItem;
  onVerdict: (
    verdict:
      | { decision: 'confirm' }
      | { decision: 'override'; score: number; comment: string; corrected: string | null }
  ) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [score, setScore] = useState(String(item.override?.score ?? item.score));
  const [comment, setComment] = useState(item.override?.comment ?? '');

  return (
    <article className="card stack" aria-label={`Bewertung von ${item.learner}`}>
      <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <strong>{item.learner}</strong>
        <span className="muted">
          {item.kind === 'speech' ? 'Gesprochen' : 'Geschrieben'} ·{' '}
          {new Date(item.createdAt).toLocaleDateString('de-DE')}
        </span>
      </div>
      {item.task && <span className="muted">Aufgabe: {item.task}</span>}
      <ArabicText size="lg">{item.answer}</ArabicText>
      <span>
        KI: <strong>{item.score}</strong>/100
        {item.override && (
          <>
            {' '}
            · Deine Bewertung: <strong>{item.override.score}</strong>/100
            {item.override.comment ? ` – ${item.override.comment}` : ''}
          </>
        )}
        {item.status === 'confirmed' && ' · bestätigt'}
      </span>
      {item.mistakes.length > 0 && (
        <ul className="grade-mistakes">
          {item.mistakes.map((m, i) => (
            <li key={i}>
              <span className="badge">{MISTAKE_LABELS[m.category]}</span>{' '}
              <ArabicText>{m.original}</ArabicText> →{' '}
              <ArabicText>{m.correction}</ArabicText>
            </li>
          ))}
        </ul>
      )}
      {editing ? (
        <form
          className="stack"
          onSubmit={(e) => {
            e.preventDefault();
            void onVerdict({
              decision: 'override',
              score: Math.max(0, Math.min(100, Math.round(Number(score) || 0))),
              comment: comment.trim(),
              corrected: null,
            }).then(() => setEditing(false));
          }}
        >
          <label className="row" style={{ gap: '0.5rem' }}>
            Punkte
            <input
              className="input"
              inputMode="numeric"
              value={score}
              onChange={(e) => setScore(e.target.value)}
              style={{ width: 80 }}
              aria-label="Deine Punkte (0–100)"
            />
          </label>
          <textarea
            className="input"
            rows={2}
            maxLength={1000}
            placeholder="Was sollte die KI anders sehen?"
            aria-label="Dein Kommentar"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
          />
          <div className="row" style={{ gap: '0.5rem' }}>
            <button className="btn btn-primary" type="submit">
              Speichern
            </button>
            <button className="btn" type="button" onClick={() => setEditing(false)}>
              Abbrechen
            </button>
          </div>
        </form>
      ) : (
        <div className="row" style={{ gap: '0.5rem' }}>
          {item.status === 'auto' && (
            <button
              className="btn btn-primary"
              type="button"
              onClick={() => void onVerdict({ decision: 'confirm' })}
            >
              Passt
            </button>
          )}
          <button className="btn" type="button" onClick={() => setEditing(true)}>
            Anpassen
          </button>
        </div>
      )}
    </article>
  );
}
