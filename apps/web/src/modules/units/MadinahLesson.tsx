/**
 * One lesson of the Medina course (ADR-0025): our own word list and grammar in our own
 * words, the author's recording, and the book itself as page images from archive.org, at
 * the lesson's page. Book text is shown only at its source, never copied (ADR-0023).
 */
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArabicText } from '@/components';
import {
  archivePdfUrl,
  bookPageImageUrl,
  bookPageUrl,
  lessonPages,
  madinahLesson,
  madinahLessonContent,
  type MadinahGrammar,
  type MadinahWord,
} from '@/services/courses';
import { speakArabic } from '@/services/speech/tts';
import { MadinahDictation } from './MadinahDictation';
import { MadinahWordPractice } from './MadinahWordPractice';

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
          <MadinahWordPractice
            key={lesson.unit}
            unit={lesson.unit}
            words={content.words}
          />
          <MadinahDictation
            key={`dictation-${lesson.unit}`}
            unit={lesson.unit}
            words={content.words}
          />
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

      <BookPages
        // A new lesson starts with the book closed (its pages load only on request).
        key={lesson.unit}
        pages={lessonPages(book, lesson)}
        image={(page, reduced) => bookPageImageUrl(book, page, reduced)}
        pdfUrl={(page) => archivePdfUrl(book, page)}
        mirrorUrl={(page) => bookPageUrl(book, page)}
        printed={lesson.goodword}
        printedUrl={book.sources.goodword}
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
 * The lesson's pages of the book, one at a time, as page images from archive.org. Plain
 * images show on phones and computers alike; they load only when the book is opened. Where
 * the lesson is in the printed Goodword edition is given as a reference only.
 */
function BookPages({
  pages,
  image,
  pdfUrl,
  mirrorUrl,
  printed,
  printedUrl,
}: {
  pages: number[];
  image: (page: number, reduced: boolean) => string;
  pdfUrl: (page: number) => string;
  mirrorUrl: (page: number) => string;
  printed: { book: number; page: number };
  printedUrl: string;
}) {
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  // The page whose image archive.org could not deliver (the next page tries again).
  const [failed, setFailed] = useState<number | null>(null);
  const page = pages[index]!;
  return (
    <section className="card stack" aria-label="Im Buch">
      <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <strong>
          Im Buch (S. {pages[0]}–{pages[pages.length - 1]})
        </strong>
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
        <figure
          className="stack"
          style={{ margin: '0 auto', gap: '0.5rem', width: '100%', maxWidth: '40rem' }}
        >
          {failed === page ? (
            <p role="alert" className="card muted" style={{ margin: 0 }}>
              Seite {page} lässt sich gerade nicht laden. Öffne sie als PDF über die Links
              unten.
            </p>
          ) : (
            <a href={image(page, false)} {...external} title="Seite groß öffnen">
              <img
                key={page}
                src={image(page, true)}
                alt={`Buchseite ${page}`}
                onError={() => setFailed(page)}
                style={{
                  width: '100%',
                  height: 'auto',
                  aspectRatio: '1275 / 1651',
                  background: 'white',
                  borderRadius: '0.5rem',
                }}
              />
            </a>
          )}
          <figcaption className="row" style={{ justifyContent: 'space-between' }}>
            <button
              type="button"
              className="btn btn-small"
              disabled={index === 0}
              onClick={() => setIndex((i) => i - 1)}
            >
              ← Seite
            </button>
            <span className="muted">
              S. {page} ({index + 1} von {pages.length})
            </span>
            <button
              type="button"
              className="btn btn-small"
              disabled={index === pages.length - 1}
              onClick={() => setIndex((i) => i + 1)}
            >
              Seite →
            </button>
          </figcaption>
        </figure>
      )}
      <p className="muted" style={{ margin: 0, fontSize: '0.85rem' }}>
        Als PDF:{' '}
        <a href={pdfUrl(page)} {...external}>
          archive.org
        </a>{' '}
        ·{' '}
        <a href={mirrorUrl(page)} {...external}>
          AbdurRahman.org
        </a>
      </p>
      <p className="muted" style={{ margin: 0, fontSize: '0.85rem' }}>
        Gedruckt als „Madinah Arabic Reader“ (
        <a href={printedUrl} {...external}>
          Goodword
        </a>
        ): Buch {printed.book}, S. {printed.page}
      </p>
    </section>
  );
}
