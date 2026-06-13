import type { AnswerVerdict, DiffSegment } from '@/services/srs/tashkil';

interface FeedbackProps {
  verdict: AnswerVerdict;
  expected: string;
  diff?: DiffSegment[];
  /** Didaktische Begründung / Hinweis (sofortiges, spezifisches Feedback). */
  explanation?: string;
}

const VERDICT_TEXT: Record<AnswerVerdict, { label: string; cls: string }> = {
  exact: { label: '✓ Richtig (inkl. Tashkīl)', cls: 'feedback-good' },
  'tashkil-tolerant': {
    label: '✓ Richtig – Tashkīl unvollständig, aber akzeptiert',
    cls: 'feedback-warn',
  },
  wrong: { label: '✗ Noch nicht richtig', cls: 'feedback-bad' },
};

/** Sofortiges, spezifisches Feedback mit optionalem Zeichen-Diff und Begründung. */
export function Feedback({ verdict, expected, diff, explanation }: FeedbackProps) {
  const v = VERDICT_TEXT[verdict];
  return (
    <div className="stack" style={{ gap: '0.5rem' }} role="status" aria-live="polite">
      <strong className={v.cls}>{v.label}</strong>
      {verdict !== 'exact' && (
        <div>
          <span className="muted">Erwartet: </span>
          <span className="arabic-inline" style={{ fontSize: '1.4rem' }}>
            {expected}
          </span>
        </div>
      )}
      {diff && verdict === 'wrong' && (
        <div className="arabic-inline" style={{ fontSize: '1.4rem' }} aria-hidden>
          {diff.map((seg, i) =>
            seg.status === 'equal' ? (
              <span key={i}>{seg.text}</span>
            ) : (
              <span
                key={i}
                className={seg.status === 'added' ? 'diff-added' : 'diff-removed'}
              >
                {seg.text}
              </span>
            )
          )}
        </div>
      )}
      {explanation && (
        <p className="muted" style={{ margin: 0 }}>
          {explanation}
        </p>
      )}
    </div>
  );
}
