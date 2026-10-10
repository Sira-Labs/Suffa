/**
 * Shows a pronunciation assessment (stories 15.2/15.3): the sentence with each spoken letter
 * marked, the letters to work on, and up to three tips. Feedback, not a verdict: "check"
 * means the recogniser was unsure, so it is shown softer than a typical confusion.
 */
import { useTranslation } from 'react-i18next';
import type { Assessment } from '@/services/speech';

/** Vowel marks, shadda, sukūn, tanwīn and the dagger alif belong to the letter before. */
const isMark = (ch: string) => {
  const code = ch.charCodeAt(0);
  return (code >= 0x64b && code <= 0x65f) || code === 0x670;
};

/** Splits the text into segments: each letter with its marks, or one other character. */
export function letterSegments(text: string): { start: number; text: string }[] {
  const segments: { start: number; text: string }[] = [];
  for (let i = 0; i < text.length; i++) {
    const last = segments.at(-1);
    if (last && isMark(text[i]!)) last.text += text[i];
    else segments.push({ start: i, text: text[i]! });
  }
  return segments;
}

export function LetterFeedback({
  text,
  assessment,
}: {
  text: string;
  assessment: Assessment;
}) {
  const { t } = useTranslation('speaking');
  const status = new Map(assessment.letters.map((l) => [l.index, l.status]));
  const toWork = assessment.letters.filter((l) => l.status !== 'good');
  const percent = Math.round(assessment.score * 100);
  return (
    <div className="stack letter-feedback" style={{ alignItems: 'center' }}>
      <p className="arabic letter-text" lang="ar" dir="rtl" style={{ margin: 0 }}>
        {letterSegments(text).map((segment) => {
          const s = status.get(segment.start);
          return s ? (
            <span key={segment.start} className={`letter-${s}`} title={t(`letters.${s}`)}>
              {segment.text}
            </span>
          ) : (
            segment.text
          );
        })}
      </p>
      <strong className={percent >= 80 ? 'feedback-good' : 'feedback-warn'}>
        {t('letters.recognised', { percent })}
      </strong>
      {toWork.length > 0 ? (
        <ul className="row letter-list" aria-label={t('letters.toPractise')}>
          {toWork.map((l) => (
            <li key={l.index} className={`letter-chip letter-chip-${l.status}`}>
              <span className="arabic-inline">{l.letter}</span>{' '}
              {l.heard ? (
                <>
                  {t('letters.heardAs')} <span className="arabic-inline">{l.heard}</span>
                </>
              ) : (
                t('letters.notHeard')
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="feedback-good" style={{ margin: 0 }}>
          {t('letters.allClear')}
        </p>
      )}
      {assessment.tips.length > 0 && (
        <ul className="letter-tips">
          {assessment.tips.map((tip) => (
            <li key={tip}>{tip}</li>
          ))}
        </ul>
      )}
      <span className="muted" style={{ fontSize: '0.85rem' }}>
        {t('letters.heard')}{' '}
        <span className="arabic-inline">{assessment.transcript || '—'}</span>
      </span>
    </div>
  );
}
