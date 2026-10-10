/**
 * One lesson of the Medina course (ADR-0025): our own word list and grammar in our own
 * words, the author's recording, and the book itself as page images from archive.org, at
 * the lesson's page. Book text is shown only at its source, never copied (ADR-0023).
 */
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import { ArabicText, NotTranslated } from '@/components';
import { useMeaningLanguage } from '@/services/meanings';
import {
  madinahLesson,
  madinahLessonContent,
  type MadinahGrammar,
  type MadinahWord,
} from '@/services/courses';
import { speakArabic } from '@/services/speech/tts';
import { MadinahDictation } from './MadinahDictation';
import { MadinahGaps } from './MadinahGaps';
import { MadinahLessonTest } from './MadinahLessonTest';
import { MadinahWordPractice } from './MadinahWordPractice';
import { RecordingWithBook } from './MadinahRecordingBook';

export function MadinahLessonPage() {
  const { t } = useTranslation('units');
  const params = useParams();
  const lessonNo = Number(params.lesson);
  const found = Number.isInteger(lessonNo) ? madinahLesson(1, lessonNo) : null;
  if (!found) {
    return (
      <div className="stack">
        <p className="muted">{t('lessonPage.notFound')}</p>
        <Link to="/units">{t('toPath')}</Link>
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
          {t('lessonPage.back', { book: book.book })}
        </Link>
        <h1>
          {t('lesson', { n: lesson.lesson })}{' '}
          <span lang="ar" dir="rtl" className="arabic-display">
            {lesson.title}
          </span>
        </h1>
        {/* Our lesson content (topic, meanings, grammar) is German until story 16.4. */}
        {content && (
          <p style={{ margin: 0 }} lang="de">
            {content.topic}
          </p>
        )}
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
          <MadinahGaps
            key={`gaps-${lesson.unit}`}
            unit={lesson.unit}
            gaps={content.gaps}
          />
          <section className="stack" aria-label={t('lessonPage.grammar')}>
            <h2 style={{ margin: 0 }}>{t('lessonPage.grammar')}</h2>
            {content.grammar.map((g) => (
              <GrammarCard key={g.title} point={g} />
            ))}
          </section>
          <MadinahLessonTest
            key={`test-${lesson.unit}`}
            unit={lesson.unit}
            content={content}
          />
          {content.status === 'draft' && (
            <p className="muted" style={{ margin: 0, fontSize: '0.85rem' }}>
              {t('lessonPage.draft')}
            </p>
          )}
        </>
      ) : (
        <p className="card muted" style={{ margin: 0 }}>
          {t('lessonPage.comingSoon')}
        </p>
      )}

      <RecordingWithBook
        // A new lesson starts with the book closed (its pages load only on request).
        key={lesson.unit}
        book={book}
        lesson={lesson}
      />

      <nav
        className="row"
        style={{ justifyContent: 'space-between' }}
        aria-label={t('lessonPage.lessonsNav')}
      >
        {previous ? (
          <Link className="btn" to={`/units/madinah/${previous.lesson}`}>
            {t('lessonPage.previous', { n: previous.lesson })}
          </Link>
        ) : (
          <span />
        )}
        {next && (
          <Link className="btn" to={`/units/madinah/${next.lesson}`}>
            {t('lessonPage.next', { n: next.lesson })}
          </Link>
        )}
      </nav>
    </div>
  );
}

function WordList({ words }: { words: MadinahWord[] }) {
  const { t } = useTranslation('units');
  // Our Medina meanings are German only so far (story 16.4).
  const untranslated = useMeaningLanguage() !== 'de';
  return (
    <section className="card stack" aria-label={t('lessonPage.newWords')}>
      <strong>
        {t('lessonPage.newWordsCount', { count: words.length })}
        {untranslated && (
          <>
            {' '}
            <NotTranslated />
          </>
        )}
      </strong>
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
              aria-label={t('listenTo', { word: w.de })}
              onClick={() => speakArabic(w.ar)}
            >
              <ArabicText size="lg">{w.ar}</ArabicText>
              <span className="muted" lang="de">
                {w.de}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function GrammarCard({ point }: { point: MadinahGrammar }) {
  return (
    <article className="card stack" style={{ gap: '0.4rem' }} lang="de">
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
