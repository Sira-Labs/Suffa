/**
 * One lesson of the Medina course (ADR-0025): our own word list and grammar in our own
 * words, the author's recording, and the book itself in the archive.org reader, embedded at
 * the lesson's page. Book text is shown only at its source, never copied (ADR-0023).
 */
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArabicText } from '@/components';
import {
  bookReaderEmbedUrl,
  bookReaderPageUrl,
  bookPageUrl,
  madinahLesson,
  madinahLessonContent,
  type MadinahGrammar,
  type MadinahWord,
} from '@/services/courses';
import { speakArabic } from '@/services/speech/tts';

const external = { target: '_blank', rel: 'noopener noreferrer' } as const;

export function MadinahLessonPage() {
  const params = useParams();
  const lessonNo = Number(params.lesson);
  const found = Number.isInteger(lessonNo) ? madinahLesson(1, lessonNo) : null;
  if (!found) {
    return (
      <div className="stack">
        <p className="muted">Diese Lektion gibt es nicht.</p>
        <Link to="/units">Zum Lernpfad</Link>
      </div>
    );
  }
  const { book, lesson } = found;
  const content = madinahLessonContent(lesson.unit);
  const previous = book.lessons.find((l) => l.lesson === lesson.lesson - 1);
  const next = book.lessons.find((l) => l.lesson === lesson.lesson + 1);

  return (
    <div className="stack" style={{ gap: '1.25rem' }}>
      <header className="stack" style={{ gap: '0.25rem' }}>
        <Link to="/units" className="muted">
          ← Medina-Kurs, Buch {book.book}
        </Link>
        <h1>
          Lektion {lesson.lesson}{' '}
          <span lang="ar" dir="rtl" className="arabic-display">
            {lesson.title}
          </span>
        </h1>
        {content && <p style={{ margin: 0 }}>{content.topic}</p>}
      </header>

      {content ? (
        <>
          <WordList words={content.words} />
          <section className="stack" aria-label="Grammatik">
            <h2 style={{ margin: 0 }}>Grammatik</h2>
            {content.grammar.map((g) => (
              <GrammarCard key={g.title} point={g} />
            ))}
          </section>
          {content.status === 'draft' && (
            <p className="muted" style={{ margin: 0, fontSize: '0.85rem' }}>
              Entwurf: Wortbedeutungen und Erklärungen sind von Suffa geschrieben und noch
              nicht von einer Lehrkraft geprüft.
            </p>
          )}
        </>
      ) : (
        <p className="card muted" style={{ margin: 0 }}>
          Wörter und Grammatik zu dieser Lektion folgen. Bis dahin: Buch und Aufnahme
          unten.
        </p>
      )}

      <section className="card stack" aria-label="Aufnahme">
        <strong>Aufnahme von Dr. V. Abdur Rahim</strong>
        <audio
          controls
          preload="none"
          src={lesson.audio}
          aria-label={`Aufnahme Lektion ${lesson.lesson}`}
          style={{ width: '100%' }}
        />
      </section>

      <BookReader
        embedUrl={bookReaderEmbedUrl(book, lesson.page)}
        pageUrl={bookReaderPageUrl(book, lesson.page)}
        pdfUrl={bookPageUrl(book, lesson.page)}
        page={lesson.page}
      />

      <nav
        className="row"
        style={{ justifyContent: 'space-between' }}
        aria-label="Lektionen"
      >
        {previous ? (
          <Link className="btn" to={`/units/madinah/${previous.lesson}`}>
            ← Lektion {previous.lesson}
          </Link>
        ) : (
          <span />
        )}
        {next && (
          <Link className="btn" to={`/units/madinah/${next.lesson}`}>
            Lektion {next.lesson} →
          </Link>
        )}
      </nav>
    </div>
  );
}

function WordList({ words }: { words: MadinahWord[] }) {
  return (
    <section className="card stack" aria-label="Neue Wörter">
      <strong>Neue Wörter ({words.length})</strong>
      <ul
        style={{
          listStyle: 'none',
          padding: 0,
          margin: 0,
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(9.5rem, 1fr))',
          gap: '0.5rem',
        }}
      >
        {words.map((w) => (
          <li key={w.id}>
            <button
              type="button"
              className="card stack"
              style={{
                width: '100%',
                gap: '0.15rem',
                padding: '0.6rem',
                textAlign: 'center',
              }}
              aria-label={`${w.de} anhören`}
              onClick={() => speakArabic(w.ar)}
            >
              <ArabicText size="lg">{w.ar}</ArabicText>
              <span className="muted">{w.de}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function GrammarCard({ point }: { point: MadinahGrammar }) {
  return (
    <article className="card stack" style={{ gap: '0.4rem' }}>
      <strong>{point.title}</strong>
      <p style={{ margin: 0 }}>{point.text}</p>
      <ul
        className="stack"
        style={{ listStyle: 'none', padding: 0, margin: 0, gap: '0.3rem' }}
      >
        {point.examples.map((e) => (
          <li
            key={e.ar}
            className="row"
            style={{ justifyContent: 'space-between', gap: '1rem' }}
          >
            <span className="muted">{e.de}</span>
            <ArabicText>{e.ar}</ArabicText>
          </li>
        ))}
      </ul>
    </article>
  );
}

/**
 * The book at the lesson's page, in the archive.org reader (loaded only when opened, so the
 * lesson stays light on a phone). Links cover browsers that refuse the embedded reader.
 */
function BookReader({
  embedUrl,
  pageUrl,
  pdfUrl,
  page,
}: {
  embedUrl: string;
  pageUrl: string;
  pdfUrl: string;
  page: number;
}) {
  const [open, setOpen] = useState(false);
  return (
    <section className="card stack" aria-label="Im Buch">
      <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <strong>Im Buch (ab S. {page})</strong>
        <button
          type="button"
          className="btn btn-small btn-primary"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? 'Buch schließen' : 'Buch anzeigen'}
        </button>
      </div>
      {open && (
        <iframe
          title={`Buch, Seite ${page}`}
          src={embedUrl}
          style={{ width: '100%', height: '70vh', border: 0, borderRadius: '0.5rem' }}
          allowFullScreen
          loading="lazy"
          referrerPolicy="no-referrer"
        />
      )}
      <p className="muted" style={{ margin: 0, fontSize: '0.85rem' }}>
        Lädt nichts?{' '}
        <a href={pageUrl} {...external}>
          Bei archive.org öffnen
        </a>{' '}
        oder{' '}
        <a href={pdfUrl} {...external}>
          als PDF
        </a>
        .
      </p>
    </section>
  );
}
