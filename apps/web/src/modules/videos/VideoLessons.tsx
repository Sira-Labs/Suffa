/**
 * Video lessons (Sprint 12): the catalog of YouTube lessons (e.g. Muhammad al-Andalusi's
 * series to the book), filtered by unit. The videos play on YouTube's own embed. Only the
 * learner's course is shown: its units, and the videos not tied to a unit.
 */
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router-dom';
import { VideosApi, type VideoLesson } from '@/services/videos/videosApi';
import { useListenStore } from '@/state';
import { courseOfUnit, unitLabelNumber } from '@suffa/engagement';
import i18n from '@/i18n';
import { useActiveCourse } from '@/services/courses';

/** "Einheit 3" or, in the Medina course, "Lektion 3", in the interface language. */
const unitLabel = (unit: number) =>
  i18n.t(courseOfUnit(unit)?.id === 'madinah' ? 'videos:lesson' : 'videos:unit', {
    unit: unitLabelNumber(unit),
  });

const duration = (sec: number | null) =>
  sec ? `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}` : '';

export function VideoLessons({ api: injected }: { api?: VideosApi }) {
  const { t } = useTranslation('videos');
  const api = useMemo(() => injected ?? new VideosApi(), [injected]);
  const [params, setParams] = useSearchParams();
  const unit = Number(params.get('unit')) || null;
  const [videos, setVideos] = useState<VideoLesson[] | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const progress = useListenStore((s) => s.progress);

  useEffect(() => {
    void api.list().then((result) => {
      if (result.ok) setVideos(result.value.videos);
      else setUnavailable(true);
    });
  }, [api]);

  const course = useActiveCourse();
  const ofCourse = (videos ?? []).filter(
    (v) => !v.unit || courseOfUnit(v.unit)?.id === course
  );
  const units = [...new Set(ofCourse.flatMap((v) => (v.unit ? [v.unit] : [])))].sort(
    (a, b) => a - b
  );
  const shown = ofCourse.filter((v) => unit === null || v.unit === unit);

  return (
    <div className="stack">
      <h1>{t('title')}</h1>
      <p className="muted" style={{ margin: 0 }}>
        {t('intro')}
      </p>
      {unavailable && <span className="feedback-bad">{t('unavailable')}</span>}
      {units.length > 0 && (
        <div
          className="row"
          role="group"
          aria-label={course === 'madinah' ? t('chooseLesson') : t('chooseUnit')}
          style={{ flexWrap: 'wrap', gap: '0.4rem' }}
        >
          <button
            type="button"
            className={`btn ${unit === null ? 'btn-primary' : ''}`}
            aria-pressed={unit === null}
            onClick={() => setParams({})}
          >
            {t('all')}
          </button>
          {units.map((u) => (
            <button
              key={u}
              type="button"
              className={`btn ${unit === u ? 'btn-primary' : ''}`}
              aria-pressed={unit === u}
              onClick={() => setParams({ unit: String(u) })}
            >
              {unitLabel(u)}
            </button>
          ))}
        </div>
      )}
      {videos && shown.length === 0 && (
        <p className="muted">
          {ofCourse.length === 0
            ? t('noneForCourse')
            : t('noneForUnit', { unit: unitLabel(unit!) })}
        </p>
      )}
      <div className="video-grid">
        {shown.map((v) => {
          const heard = progress[`yt/${v.id}`];
          return (
            <Link key={v.id} to={`/videos/${v.id}`} className="card video-card">
              {v.thumbnailUrl && (
                <img
                  src={v.thumbnailUrl}
                  alt=""
                  loading="lazy"
                  width={320}
                  height={180}
                />
              )}
              <strong dir="auto" translate="no">
                {v.title}
              </strong>
              <span className="muted">
                {v.unit ? `${unitLabel(v.unit)} · ` : ''}
                {duration(v.durationSec)}
                {v.interactive ? t('withQuestions') : ''}
                {heard?.completedAt ? t('watched') : ''}
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
