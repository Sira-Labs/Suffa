/**
 * The Medina course's learning path, stage 1 (ADR-0025): the 23 lessons of Book 1, each with
 * the book page, the author's recording and the keys. Only links: the book stays at its
 * source. Our own exercises are added lesson by lesson later.
 */
import { Link } from 'react-router-dom';
import { Icon } from '@/components/Icon';
import {
  MADINAH_BOOKS,
  madinahLessonContent,
  type MadinahBook,
} from '@/services/courses';
import { arabicNumber } from '@/services/units';

const external = { target: '_blank', rel: 'noopener noreferrer' } as const;

export function MadinahPath() {
  return (
    <div className="stack" style={{ gap: '1.5rem' }}>
      {MADINAH_BOOKS.map((book) => (
        <MadinahBookPath key={book.book} book={book} />
      ))}
    </div>
  );
}

function MadinahBookPath({ book }: { book: MadinahBook }) {
  return (
    <>
      <header className="stack" style={{ gap: '0.25rem' }}>
        <span className="eyebrow">Medina-Kurs · {book.author}</span>
        <h1>
          Buch {book.book} ·{' '}
          <span lang="ar" dir="rtl" className="arabic-display level-title-ar">
            {book.title}
          </span>
        </h1>
        <p className="muted" style={{ margin: 0 }}>
          Arbeite mit dem Buch: Jede Lektion öffnet die passende Seite und die Aufnahme
          von Dr. Abdur Rahim. Eigene Übungen (Wortkarten, Diktate, Lückentexte) kommen
          Lektion für Lektion dazu.
        </p>
      </header>

      <section className="card stack" aria-label="Material zum Buch">
        <strong>Material zum Buch</strong>
        <div className="row" style={{ flexWrap: 'wrap', gap: '0.5rem' }}>
          <a className="btn btn-small" href={book.sources.book} {...external}>
            Buch (PDF)
          </a>
          <a className="btn btn-small" href={book.sources.solutions} {...external}>
            Lösungen (arabisch)
          </a>
          <a className="btn btn-small" href={book.sources.englishKey} {...external}>
            Schlüssel (englisch)
          </a>
          <a className="btn btn-small" href={book.sources.glossary} {...external}>
            Glossar
          </a>
          <a className="btn btn-small" href={book.sources.classNotes} {...external}>
            Unterrichtsnotizen
          </a>
          <a className="btn btn-small" href={book.sources.videos} {...external}>
            Video-Lektionen
          </a>
          <a className="btn btn-small" href={book.sources.vocabularyList} {...external}>
            Vokabelliste
          </a>
          <a className="btn btn-small" href={book.sources.grammarRules} {...external}>
            Grammatik-Übersicht
          </a>
          <a className="btn btn-small" href={book.sources.crossword} {...external}>
            Kreuzworträtsel
          </a>
          <a className="btn btn-small" href={book.sources.slideNotes} {...external}>
            Folien-Notizen
          </a>
        </div>
        <p className="muted" style={{ margin: 0, fontSize: '0.85rem' }}>
          Bereitgestellt von{' '}
          <a href={book.sources.overview} {...external}>
            AbdurRahman.org
          </a>{' '}
          und archive.org, mit freundlicher Erlaubnis von Dr. V. Abdur Rahim – nur zur
          persönlichen Nutzung. <Link to="/sources">Alle Quellen & Lizenzen</Link>
        </p>
      </section>

      <ol className="stack" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {book.lessons.map((lesson) => {
          const content = madinahLessonContent(lesson.unit);
          return (
            <li key={lesson.unit} aria-label={`Lektion ${lesson.lesson}`}>
              <Link
                to={`/units/madinah/${lesson.lesson}`}
                className="card row"
                style={{ gap: '0.75rem', alignItems: 'center' }}
              >
                <span className="unit-hero-number arabic-display" aria-hidden>
                  {arabicNumber(lesson.lesson)}
                </span>
                <span className="stack" style={{ gap: 0, flex: 1 }}>
                  <strong>Lektion {lesson.lesson}</strong>
                  <span className="muted">
                    {content
                      ? `${content.topic} · ${content.words.length} Wörter`
                      : `Buch S. ${lesson.page} · Aufnahme`}
                  </span>
                </span>
                <Icon name="arrowRight" />
              </Link>
            </li>
          );
        })}
      </ol>
    </>
  );
}
