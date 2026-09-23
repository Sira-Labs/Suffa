import type { DiffSegment } from '@/services/srs/tashkil';
import type { RecallVerdict } from '@/services/srs/recall';

interface FeedbackProps {
  verdict: RecallVerdict;
  expected: string;
  /** Whether `expected` is Arabic (RTL, Arabic font). Default: true. */
  expectedIsArabic?: boolean;
  /** Translations: further correct meanings the learner did not type. */
  alsoCorrect?: string[];
  diff?: DiffSegment[];
  /** Didaktische Begründung / Hinweis (sofortiges, spezifisches Feedback). */
  explanation?: string;
}

const VERDICT_TEXT: Record<RecallVerdict, { label: string; cls: string }> = {
  exact: { label: '✓ Richtig', cls: 'feedback-good' },
  accepted: { label: '✓ Richtig', cls: 'feedback-good' },
  typo: { label: '✓ Richtig – kleiner Tippfehler', cls: 'feedback-warn' },
  'tashkil-tolerant': {
    label: '✓ Richtig – Tashkīl unvollständig, aber akzeptiert',
    cls: 'feedback-warn',
  },
  wrong: { label: '✗ Noch nicht richtig', cls: 'feedback-bad' },
};

/** Sofortiges, spezifisches Feedback mit optionalem Zeichen-Diff und Begründung. */
export function Feedback({
  verdict,
  expected,
  expectedIsArabic = true,
  alsoCorrect = [],
  diff,
  explanation,
}: FeedbackProps) {
  const v = VERDICT_TEXT[verdict];
  const showExpected =
    verdict === 'wrong' || verdict === 'typo' || verdict === 'tashkil-tolerant';
  const expectedStyle = expectedIsArabic
    ? { className: 'arabic-inline', style: { fontSize: '1.4rem' } }
    : { style: { fontSize: '1.1rem', fontWeight: 600 } };
  return (
    <div className="stack" style={{ gap: '0.5rem' }} role="status" aria-live="polite">
      <strong className={v.cls}>{v.label}</strong>
      {showExpected && (
        <div>
          <span className="muted">
            {verdict === 'wrong' ? 'Erwartet: ' : 'Richtig: '}
          </span>
          <span {...expectedStyle}>{expected}</span>
        </div>
      )}
      {!showExpected && alsoCorrect.length > 0 && (
        <div>
          <span className="muted">Auch richtig: </span>
          <span style={{ fontWeight: 600 }}>{alsoCorrect.join(', ')}</span>
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
