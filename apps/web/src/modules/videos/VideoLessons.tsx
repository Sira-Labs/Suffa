/**
 * Video lessons (Sprint 12): the catalog of YouTube lessons (e.g. Muhammad al-Andalusi's
 * series to the book), filtered by unit. The videos play on YouTube's own embed.
 */
import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { VideosApi, type VideoLesson } from '@/services/videos/videosApi';
import { useListenStore } from '@/state';

const duration = (sec: number | null) =>
  sec ? `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}` : '';

export function VideoLessons({ api: injected }: { api?: VideosApi }) {
  const api = useMemo(() => injected ?? new VideosApi(), [injected]);
  const [params, setParams] = useSearchParams();
  const unit = Number(params.get('unit')) || null;
  const [videos, setVideos] = useState<VideoLesson[] | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const progress = useListenStore((s) => s.progress);

  useEffect(() => {
    void api.list().then((result) => {
      if (result.ok) setVideos(result.value.videos);
      else setMessage('Die Videolektionen sind gerade nicht erreichbar (offline?).');
    });
  }, [api]);

  const units = [
    ...new Set((videos ?? []).flatMap((v) => (v.unit ? [v.unit] : []))),
  ].sort((a, b) => a - b);
  const shown = (videos ?? []).filter((v) => unit === null || v.unit === unit);

  return (
    <div className="stack">
      <h1>Videolektionen</h1>
      <p className="muted" style={{ margin: 0 }}>
        Lektionen zum Buch auf YouTube – mit Fragen zwischendurch, wo die Autoren es
        erlauben.
      </p>
      {message && <span className="feedback-bad">{message}</span>}
      {units.length > 0 && (
        <div
          className="row"
          role="group"
          aria-label="Einheit wählen"
          style={{ flexWrap: 'wrap', gap: '0.4rem' }}
        >
          <button
            type="button"
            className={`btn ${unit === null ? 'btn-primary' : ''}`}
            aria-pressed={unit === null}
            onClick={() => setParams({})}
          >
            Alle
          </button>
          {units.map((u) => (
            <button
              key={u}
              type="button"
              className={`btn ${unit === u ? 'btn-primary' : ''}`}
              aria-pressed={unit === u}
              onClick={() => setParams({ unit: String(u) })}
            >
              Einheit {u}
            </button>
          ))}
        </div>
      )}
      {videos?.length === 0 && <p className="muted">Noch keine Videolektionen.</p>}
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
              <strong dir="auto">{v.title}</strong>
              <span className="muted">
                {v.unit ? `Einheit ${v.unit} · ` : ''}
                {duration(v.durationSec)}
                {v.interactive ? ' · mit Fragen' : ''}
                {heard?.completedAt ? ' · ✓ angesehen' : ''}
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
