/**
 * "Hören & Sehen" in the Medina course (ADR-0025): the author's recording of each lesson
 * (streamed from archive.org) and the links to the whole collection and the video lessons.
 * Only links and streams; nothing of the course is copied (ADR-0023).
 */
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Icon } from '@/components/Icon';
import { MADINAH_BOOKS, madinahLessonContent } from '@/services/courses';

const external = { target: '_blank', rel: 'noopener noreferrer' } as const;

export function MadinahLibrary() {
  const book = MADINAH_BOOKS[0]!;
  const [params] = useSearchParams();
  const requested = book.lessons.findIndex(
    (l) => l.lesson === Number(params.get('lesson'))
  );
  const [index, setIndex] = useState(Math.max(requested, 0));
  const lesson = book.lessons[index]!;
  const topic = madinahLessonContent(lesson.unit)?.topic;

  return (
    <div className="stack">
      <h1 style={{ margin: 0 }}>Hören & Sehen</h1>
      <p className="muted" style={{ margin: 0 }}>
        Die Aufnahmen von Dr. V. Abdur Rahim zu Buch {book.book}, Lektion für Lektion. Du
        liest im Buch mit. Streams brauchen Internet.
      </p>

      <section className="card stack" aria-labelledby="audio-heading">
        <div
          className="row"
          style={{ justifyContent: 'space-between', flexWrap: 'nowrap' }}
        >
          <h2 id="audio-heading" style={{ margin: 0 }}>
            Lektion {lesson.lesson}
            {topic && <span className="muted"> · {topic}</span>}
          </h2>
          <div className="row" style={{ gap: '0.4rem', flexShrink: 0 }}>
            <button
              className="btn icon-btn"
              aria-label="Vorherige Lektion"
              disabled={index === 0}
              onClick={() => setIndex(index - 1)}
            >
              <Icon name="arrowLeft" size={18} />
            </button>
            <button
              className="btn icon-btn"
              aria-label="Nächste Lektion"
              disabled={index === book.lessons.length - 1}
              onClick={() => setIndex(index + 1)}
            >
              <Icon name="arrowRight" size={18} />
            </button>
          </div>
        </div>
        <audio
          // A new lesson starts a new stream.
          key={lesson.unit}
          controls
          preload="none"
          src={lesson.audio}
          aria-label={`Aufnahme Lektion ${lesson.lesson}`}
          style={{ width: '100%' }}
        />
        <Link className="btn" to={`/units/madinah/${lesson.lesson}`}>
          Zur Lektion mit Wörtern und Übungen
        </Link>
      </section>

      <section className="card stack" aria-labelledby="more-heading">
        <h2 id="more-heading" style={{ margin: 0 }}>
          Mehr zum Buch
        </h2>
        <div className="row" style={{ flexWrap: 'wrap', gap: '0.5rem' }}>
          <a className="btn btn-small" href={book.sources.audioCollection} {...external}>
            Alle Aufnahmen
          </a>
          <a className="btn btn-small" href={book.sources.videos} {...external}>
            Video-Lektionen
          </a>
          <Link className="btn btn-small" to="/videos">
            Videolektionen in der App
          </Link>
        </div>
      </section>
    </div>
  );
}
