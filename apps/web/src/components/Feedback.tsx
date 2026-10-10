import { useTranslation } from 'react-i18next';
import type { DiffSegment } from '@/services/srs/tashkil';
import type { RecallVerdict } from '@/services/srs/recall';
import { NotTranslated } from './Meaning';

interface FeedbackProps {
  verdict: RecallVerdict;
  expected: string;
  /** Whether `expected` is Arabic (RTL, Arabic font). Default: true. */
  expectedIsArabic?: boolean;
  /** Translations: further correct meanings the learner did not type. */
  alsoCorrect?: string[];
  diff?: DiffSegment[];
  /** Didactic explanation / hint (immediate, specific feedback). */
  explanation?: string;
  /** Language of the explanation when it is course content (a German meaning: "de"). */
  explanationLang?: string;
  /** Language of a Latin `expected` and `alsoCorrect` (the meaning language, story 16.4). */
  expectedLang?: string;
  /** The meaning shown is the German fallback for a missing English one. */
  meaningMissing?: boolean;
}

const VERDICT: Record<
  RecallVerdict,
  { key: 'correct' | 'typo' | 'tashkilTolerant' | 'wrong'; cls: string }
> = {
  exact: { key: 'correct', cls: 'feedback-good' },
  accepted: { key: 'correct', cls: 'feedback-good' },
  typo: { key: 'typo', cls: 'feedback-warn' },
  'tashkil-tolerant': { key: 'tashkilTolerant', cls: 'feedback-warn' },
  wrong: { key: 'wrong', cls: 'feedback-bad' },
};

/** Immediate, specific feedback with optional character diff and explanation. */
export function Feedback({
  verdict,
  expected,
  expectedIsArabic = true,
  alsoCorrect = [],
  diff,
  explanation,
  explanationLang,
  expectedLang = 'de',
  meaningMissing = false,
}: FeedbackProps) {
  const { t } = useTranslation('components');
  const v = VERDICT[verdict];
  const showExpected =
    verdict === 'wrong' || verdict === 'typo' || verdict === 'tashkil-tolerant';
  const expectedStyle = expectedIsArabic
    ? { className: 'arabic-inline', style: { fontSize: '1.4rem' } }
    : // A Latin answer is a meaning, in the learner's meaning language.
      { style: { fontSize: '1.1rem', fontWeight: 600 }, lang: expectedLang };
  return (
    <div className="stack" style={{ gap: '0.5rem' }} role="status" aria-live="polite">
      <strong className={v.cls}>{t(`feedback.${v.key}`)}</strong>
      {showExpected && (
        <div>
          <span className="muted">
            {verdict === 'wrong' ? t('feedback.expected') : t('feedback.right')}
          </span>
          <span {...expectedStyle}>{expected}</span>
          {meaningMissing && (
            <>
              {' '}
              <NotTranslated />
            </>
          )}
        </div>
      )}
      {!showExpected && alsoCorrect.length > 0 && (
        <div>
          <span className="muted">{t('feedback.alsoCorrect')}</span>
          <span style={{ fontWeight: 600 }} lang={expectedLang}>
            {alsoCorrect.join(', ')}
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
        <p className="muted" style={{ margin: 0 }} lang={explanationLang}>
          {explanation}
        </p>
      )}
    </div>
  );
}
