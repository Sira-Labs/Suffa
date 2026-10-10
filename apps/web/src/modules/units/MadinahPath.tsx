/**
 * The Medina course's learning path, stage 1 (ADR-0025): the 23 lessons of Book 1, each with
 * the book page, the author's recording and the keys. Only links: the book stays at its
 * source. Our own exercises are added lesson by lesson later.
 */
import { Trans, useTranslation } from 'react-i18next';
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

const SOURCE_LINKS = [
  'book',
  'solutions',
  'englishKey',
  'glossary',
  'classNotes',
  'videos',
  'vocabularyList',
  'grammarRules',
  'crossword',
  'slideNotes',
] as const;

function MadinahBookPath({ book }: { book: MadinahBook }) {
  const { t } = useTranslation('units');
  return (
    <>
      <header className="stack" style={{ gap: '0.25rem' }}>
        <span className="eyebrow">{t('madinah.courseBy', { author: book.author })}</span>
        <h1>
          {t('madinah.book', { book: book.book })} ·{' '}
          <span lang="ar" dir="rtl" className="arabic-display level-title-ar">
            {book.title}
          </span>
        </h1>
        <p className="muted" style={{ margin: 0 }}>
          {t('madinah.intro')}
        </p>
      </header>

      <section className="card stack" aria-label={t('madinah.materials')}>
        <strong>{t('madinah.materials')}</strong>
        <div className="row" style={{ flexWrap: 'wrap', gap: '0.5rem' }}>
          {SOURCE_LINKS.map((source) => (
            <a
              key={source}
              className="btn btn-small"
              href={book.sources[source]}
              {...external}
            >
              {t(`madinah.sources.${source}`)}
            </a>
          ))}
        </div>
        <p className="muted" style={{ margin: 0, fontSize: '0.85rem' }}>
          <Trans
            t={t}
            i18nKey="madinah.credit"
            components={{
              1: <a href={book.sources.overview} {...external} />,
              2: <Link to="/sources" />,
            }}
          />
        </p>
      </section>

      <ol className="stack" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {book.lessons.map((lesson) => {
          const content = madinahLessonContent(lesson.unit);
          return (
            <li key={lesson.unit} aria-label={t('lesson', { n: lesson.lesson })}>
              <Link
                to={`/units/madinah/${lesson.lesson}`}
                className="card row"
                style={{ gap: '0.75rem', alignItems: 'center' }}
              >
                <span className="unit-hero-number arabic-display" aria-hidden>
                  {arabicNumber(lesson.lesson)}
                </span>
                <span className="stack" style={{ gap: 0, flex: 1 }}>
                  <strong>{t('lesson', { n: lesson.lesson })}</strong>
                  <span className="muted">
                    {content
                      ? t('madinah.lessonWords', {
                          topic: content.topic,
                          count: content.words.length,
                        })
                      : t('madinah.lessonPage', { page: lesson.page })}
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
