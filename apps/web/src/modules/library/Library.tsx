import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { Icon } from '@/components/Icon';
import { BookVideos } from './BookVideos';
import { PublisherAudio } from './PublisherAudio';
import { MadinahLibrary } from './MadinahLibrary';
import { useActiveCourse } from '@/services/courses';

const UNITS = 16;

/**
 * "Hören": the publisher's page videos and official audio for Book 1, for one unit at a time.
 * Both stream from the publisher (YouTube / their server); the app itself stays usable offline.
 * `?unit=4&lesson=24` or `?unit=4&section=videos` come from a unit's learning path.
 */
export function Library() {
  return useActiveCourse() === 'madinah' ? <MadinahLibrary /> : <BookLibrary />;
}

function BookLibrary() {
  const { t } = useTranslation('library');
  const [params] = useSearchParams();
  const initialUnit = Number(params.get('unit')) || 1;
  const lesson = Number(params.get('lesson')) || undefined;
  const showVideos = params.get('section') === 'videos';
  const [unit, setUnit] = useState(initialUnit);
  const videosRef = useRef<HTMLElement>(null);

  useEffect(() => setUnit(initialUnit), [initialUnit]);
  useEffect(() => {
    if (showVideos) videosRef.current?.scrollIntoView?.({ block: 'start' });
  }, [showVideos]);

  return (
    <div className="stack">
      <h1 style={{ margin: 0 }}>{t('title')}</h1>
      <p className="muted" style={{ margin: 0 }}>
        {t('intro')}
      </p>

      <section
        ref={videosRef}
        className="card stack"
        aria-labelledby="videos-heading"
        style={{ scrollMarginTop: '1rem' }}
      >
        <div
          className="row"
          style={{ justifyContent: 'space-between', flexWrap: 'nowrap' }}
        >
          <h2 id="videos-heading" style={{ margin: 0 }}>
            {t('videosHeading', {
              part: unit <= UNITS ? t('unit', { unit }) : t('tests'),
            })}
          </h2>
          <div className="row" style={{ gap: '0.4rem', flexShrink: 0 }}>
            <button
              className="btn icon-btn"
              aria-label={t('previousUnit')}
              disabled={unit <= 1}
              hidden={unit > UNITS}
              onClick={() => setUnit(unit - 1)}
            >
              <Icon name="arrowLeft" size={18} />
            </button>
            <button
              className="btn icon-btn"
              aria-label={t('nextUnit')}
              disabled={unit >= UNITS}
              hidden={unit > UNITS}
              onClick={() => setUnit(unit + 1)}
            >
              <Icon name="arrowRight" size={18} />
            </button>
          </div>
        </div>
        {unit <= UNITS ? (
          <BookVideos unit={unit} />
        ) : (
          <p className="muted" style={{ margin: 0 }}>
            {t('noTestVideos')}
          </p>
        )}
      </section>

      <section className="card stack" aria-labelledby="audio-heading">
        <h2 id="audio-heading" style={{ margin: 0 }}>
          {t('audioHeading')}
        </h2>
        <PublisherAudio
          key={lesson ?? ''}
          unit={unit}
          onUnitChange={setUnit}
          focusLesson={lesson}
        />
      </section>
    </div>
  );
}
