import { useMemo, useState } from 'react';
import type { Quelle } from '@/types';
import { content } from '@/content';
import { PublisherAudio } from './PublisherAudio';

function youtubeEmbed(url: string): string | null {
  const watch = url.match(/[?&]v=([\w-]+)/);
  if (watch?.[1]) return `https://www.youtube.com/embed/${watch[1]}`;
  const list = url.match(/[?&]list=([\w-]+)/);
  if (list?.[1]) return `https://www.youtube.com/embed/videoseries?list=${list[1]}`;
  return null;
}

/**
 * Source library: embedded YouTube players + external audio links.
 * Note: embedded streams need a network; the app itself stays usable offline.
 */
export function Library() {
  const quellen = content.quellen;
  const videos = useMemo(
    () =>
      quellen.filter((q) => q.typ === 'youtube_video' || q.typ === 'youtube_playlist'),
    [quellen]
  );
  const audios = useMemo(
    () => quellen.filter((q) => q.typ === 'verlag_audio' || q.typ === 'archive_audio'),
    [quellen]
  );
  const [active, setActive] = useState<Quelle | undefined>(videos[0]);
  const embed = active ? youtubeEmbed(active.url) : null;

  return (
    <div className="stack">
      <h1 style={{ margin: 0 }}>Quellenbibliothek</h1>
      <p className="muted">
        „Hören & Mitlesen“ zu den Einheiten. Externe Streams erfordern eine
        Internetverbindung; alle Lernfunktionen funktionieren auch offline.
      </p>

      <div className="card stack">
        <strong>Videos</strong>
        <div className="row">
          {videos.map((q) => (
            <button
              key={q.url}
              className={`btn ${q.url === active?.url ? 'btn-accent' : ''}`}
              onClick={() => setActive(q)}
            >
              {q.titel}
            </button>
          ))}
        </div>
        {embed && (
          <div style={{ position: 'relative', paddingTop: '56.25%' }}>
            <iframe
              title={active?.titel}
              src={embed}
              style={{
                position: 'absolute',
                inset: 0,
                width: '100%',
                height: '100%',
                border: 0,
                borderRadius: 8,
              }}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>
        )}
        {active && !embed && (
          <a className="btn" href={active.url} target="_blank" rel="noreferrer">
            In neuem Tab öffnen
          </a>
        )}
      </div>

      <div className="card stack">
        <strong>Offizielle Audios – Buch 1</strong>
        <PublisherAudio />
      </div>

      <div className="card stack">
        <strong>Audio-Quellen</strong>
        {audios.map((q) => (
          <a
            key={q.url}
            className="row"
            href={q.url}
            target="_blank"
            rel="noreferrer"
            style={{ justifyContent: 'space-between' }}
          >
            <span>{q.titel}</span>
            <span className="badge">
              {q.typ === 'verlag_audio' ? 'Verlag' : 'Archive'}
            </span>
          </a>
        ))}
      </div>
    </div>
  );
}
