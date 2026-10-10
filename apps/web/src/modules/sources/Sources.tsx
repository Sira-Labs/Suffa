/**
 * Sources and licences (ADR-0023, ADR-0025): where every piece of content comes from, under
 * which terms, and a link to the original. Naming a source does not replace permission:
 * book texts and pictures stay at their sources until the rights holders allow more.
 */
import { Trans, useTranslation } from 'react-i18next';
import { MADINAH_BOOKS } from '@/services/courses';

const external = { target: '_blank', rel: 'noopener noreferrer' } as const;

const listStyle = { margin: 0, paddingLeft: '1.1rem', gap: '0.3rem' } as const;

export function Sources() {
  const { t } = useTranslation('sources');
  const madinah = MADINAH_BOOKS[0]!;
  return (
    <div className="stack" style={{ gap: '1.25rem' }}>
      <header className="stack" style={{ gap: '0.25rem' }}>
        <h1>{t('title')}</h1>
        <p className="muted" style={{ margin: 0 }}>
          {t('intro')}
        </p>
      </header>

      <section className="card stack" aria-labelledby="src-madinah">
        <h2 id="src-madinah" style={{ margin: 0 }}>
          {t('madinah.title')}
        </h2>
        <p style={{ margin: 0 }}>{t('madinah.about')}</p>
        <ul className="stack" style={listStyle}>
          <li>
            <Trans
              t={t}
              i18nKey="madinah.book"
              components={{
                1: <a href={madinah.sources.overview} {...external} />,
                3: (
                  <a
                    href={`https://archive.org/details/${madinah.sources.archiveItem}`}
                    {...external}
                  />
                ),
              }}
            />
          </li>
          <li>
            <Trans
              t={t}
              i18nKey="madinah.print"
              components={{ 1: <a href={madinah.sources.goodword} {...external} /> }}
            />
          </li>
          <li>
            <Trans
              t={t}
              i18nKey="madinah.recordings"
              components={{
                1: <a href={madinah.sources.audioCollection} {...external} />,
              }}
            />
          </li>
          <li>{t('madinah.own')}</li>
        </ul>
      </section>

      <section className="card stack" aria-labelledby="src-bayna">
        <h2 id="src-bayna" style={{ margin: 0 }}>
          {t('bayna.title')}
        </h2>
        <ul className="stack" style={listStyle}>
          <li>
            <Trans
              t={t}
              i18nKey="bayna.media"
              components={{ 1: <a href="https://www.arabicforall.net" {...external} /> }}
            />
          </li>
          <li>{t('bayna.own')}</li>
        </ul>
      </section>

      <section className="card stack" aria-labelledby="src-more">
        <h2 id="src-more" style={{ margin: 0 }}>
          {t('more.title')}
        </h2>
        <ul className="stack" style={listStyle}>
          <li>
            <Trans
              t={t}
              i18nKey="more.examples"
              components={{
                1: <a href="https://tatoeba.org" {...external} />,
                3: (
                  <a
                    href="https://creativecommons.org/licenses/by/2.0/fr/"
                    {...external}
                  />
                ),
              }}
            />
          </li>
          <li>{t('more.discover')}</li>
          <li>{t('more.fonts')}</li>
        </ul>
      </section>

      <p className="muted" style={{ margin: 0, fontSize: '0.85rem' }}>
        {t('takedown')}
      </p>
    </div>
  );
}
