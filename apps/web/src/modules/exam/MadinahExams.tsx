/**
 * "Prüfung" in the Medina course (ADR-0025): each lesson has its own test on its page (meanings
 * and gap sentences, 80 % passes). This screen lists the lessons with their result and leads to
 * the next test.
 */
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Icon } from '@/components/Icon';
import { madinahProgress } from '@/services/courses';
import { useEnrollmentStore } from '@/state';

export function MadinahExams() {
  const { t } = useTranslation('exam');
  const exams = useEnrollmentStore((s) => s.exams);
  const { lessons, passed, next } = madinahProgress(exams);
  return (
    <div className="stack">
      <h1 style={{ margin: 0 }}>{t('madinah.title')}</h1>
      <p className="muted" style={{ margin: 0 }}>
        {t('madinah.intro', { passed, total: lessons.length })}
      </p>
      {next && (
        <Link
          to={`/units/madinah/${next.lesson.lesson}`}
          className="btn btn-primary btn-lg"
        >
          {t('madinah.toTest', { lesson: next.lesson.lesson })}
          <Icon name="arrowRight" size={20} />
        </Link>
      )}
      <ul
        className="card stack"
        aria-label={t('madinah.tests')}
        style={{ listStyle: 'none' }}
      >
        {lessons.map(({ lesson, topic, passed: done }) => (
          <li key={lesson.unit}>
            <Link
              to={`/units/madinah/${lesson.lesson}`}
              className="row"
              style={{ justifyContent: 'space-between', flexWrap: 'nowrap' }}
            >
              <span>
                {t('madinah.lesson', { lesson: lesson.lesson })}
                {topic && <span className="muted"> · {topic}</span>}
              </span>
              <span className={done ? 'feedback-good' : 'muted'}>
                {done ? t('madinah.passed') : t('madinah.open')}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
