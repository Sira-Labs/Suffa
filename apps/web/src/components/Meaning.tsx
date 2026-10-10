import type { CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import type { Meaning } from '@/services/meanings';

/** Marks a German meaning shown because the English one is missing (story 16.4). */
export function NotTranslated() {
  const { t } = useTranslation('components');
  return (
    <span className="badge badge-untranslated" title={t('meaning.notTranslatedHint')}>
      {t('meaning.notTranslated')}
    </span>
  );
}

/** A meaning in its language, with the "not yet translated" badge for a German fallback. */
export function MeaningText({
  meaning,
  className,
  style,
}: {
  meaning: Meaning;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <>
      <span lang={meaning.lang} className={className} style={style}>
        {meaning.text}
      </span>
      {meaning.missing && (
        <>
          {' '}
          <NotTranslated />
        </>
      )}
    </>
  );
}
