import { Trans, useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Icon } from '@/components/Icon';
import type { ExamResult, UnitEnrollment } from '@/types';
import { enrollmentStatus } from '@/services/enrollment';
import { useEnrollmentStore } from '@/state';
import { daysLeftLabel } from '@/modules/units/UnitGate';
import { unitToContinue, useBookProgress } from '@/modules/units/useBookProgress';
import { splitUnitTitle } from '@/services/units';
import { madinahProgress, useActiveCourse } from '@/services/courses';

/**
 * "Heute" opens with the learner's unit: the started unit (or the next one to start), the
 * section and station that come next, its countdown and one button to continue right there.
 */
export function CurrentUnitCard() {
  return useActiveCourse() === 'madinah' ? <MadinahLessonCard /> : <BookUnitCard />;
}

/** The Medina course: the first lesson whose test is not passed yet. */
function MadinahLessonCard() {
  const { t } = useTranslation(['dashboard', 'units']);
  const exams = useEnrollmentStore((s) => s.exams);
  const { next, passed } = madinahProgress(exams);
  if (!next) {
    return (
      <section className="card stack current-unit-card" aria-labelledby="current-unit">
        <span className="eyebrow" style={{ color: 'var(--accent)' }}>
          {t('currentUnit.madinahCourse')}
        </span>
        <h2 id="current-unit" style={{ margin: 0 }}>
          {t('currentUnit.bookDone')}
        </h2>
        <p className="muted" style={{ margin: 0 }}>
          {t('currentUnit.allPassed', { count: passed })}
        </p>
      </section>
    );
  }
  const { lesson, topic } = next;
  return (
    <section className="card stack current-unit-card" aria-labelledby="current-unit">
      <span className="eyebrow" style={{ color: 'var(--accent)' }}>
        {t('currentUnit.yourLesson')}
      </span>
      <h2 id="current-unit" style={{ margin: 0 }}>
        {t('units:lesson', { n: lesson.lesson })}
        {/* Lesson topics and unit titles are course content: German until story 16.4. */}
        {topic && (
          <span className="muted current-unit-name">
            {' · '}
            <span lang="de">{topic}</span>
          </span>
        )}
      </h2>
      <p className="muted" style={{ margin: 0 }}>
        {passed === 0
          ? t('currentUnit.firstLesson')
          : t('currentUnit.lessonsPassed', { count: passed })}
      </p>
      <Link to={`/units/madinah/${lesson.lesson}`} className="btn btn-primary btn-lg">
        {t('currentUnit.openLesson', { n: lesson.lesson })}
        <Icon name="arrowRight" size={20} />
      </Link>
    </section>
  );
}

/** Al-Arabiyya bayna Yadayk: the started unit, or the next one to start. */
function BookUnitCard() {
  const { t } = useTranslation(['dashboard', 'units']);
  const enrollments = useEnrollmentStore((s) => s.enrollments);
  const exams = useEnrollmentStore((s) => s.exams);
  const { units } = useBookProgress();
  const activeNo = activeEnrollment(enrollments, exams)?.e.unit;
  const entry = units.find((u) => u.unit.unit === activeNo) ?? unitToContinue(units);
  if (!entry) return null;

  const { unit, title, status, sections, progress } = entry;
  const started = status.state !== 'not-started';
  const section = sections.find((s) => s.state === 'current');
  const station = section?.stations.find((s) => s.state === 'current');
  const name = title ? splitUnitTitle(title).de : null;
  const to = started && station ? station.to : `/units/${unit.unit}`;

  return (
    <section className="card stack current-unit-card" aria-labelledby="current-unit">
      <span className="eyebrow" style={{ color: 'var(--accent)' }}>
        {t('currentUnit.yourUnit')}
      </span>
      <h2 id="current-unit" style={{ margin: 0 }}>
        {t('units:unit', { n: unit.unit })}
        {name && (
          <span className="muted current-unit-name">
            {' · '}
            <span lang="de">{name}</span>
          </span>
        )}
      </h2>
      {started ? (
        <>
          {section && station && (
            <p style={{ margin: 0 }}>
              <strong>{section.label}</strong>
              <span className="muted">
                {t('currentUnit.upNext', { station: station.label })}
              </span>
            </p>
          )}
          <div className="row" style={{ gap: '0.75rem', flexWrap: 'nowrap' }}>
            <div
              className="review-progress"
              role="progressbar"
              aria-label={t('units:unitProgress', { n: unit.unit })}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={progress.percent}
            >
              <div style={{ width: `${progress.percent}%` }} />
            </div>
            <span className="muted" style={{ whiteSpace: 'nowrap' }}>
              {progress.percent} %
            </span>
          </div>
          {(status.state === 'running' || status.state === 'overdue') && (
            <span
              className="row muted"
              style={{
                gap: '0.35rem',
                color: status.state === 'overdue' ? 'var(--warn)' : undefined,
              }}
            >
              <Icon name="clock" size={15} />
              {status.state === 'running'
                ? daysLeftLabel(status.daysLeft)
                : t('currentUnit.deadlinePassed')}
            </span>
          )}
        </>
      ) : (
        <p className="muted" style={{ margin: 0 }}>
          <Trans
            t={t}
            i18nKey="currentUnit.notStarted"
            components={{ 1: <Link to="/alphabet" /> }}
          />
        </p>
      )}
      <Link to={to} className="btn btn-primary btn-lg">
        {started
          ? t('currentUnit.continue')
          : t('currentUnit.startUnit', { n: unit.unit })}
        <Icon name="arrowRight" size={20} />
      </Link>
    </section>
  );
}

/** The latest started unit whose test is not passed yet. */
function activeEnrollment(
  enrollments: Record<number, UnitEnrollment>,
  exams: ExamResult[]
) {
  return Object.values(enrollments)
    .map((e) => ({ e, status: enrollmentStatus(e, exams, e.unit) }))
    .filter(({ status }) => status.state === 'running' || status.state === 'overdue')
    .sort((a, b) => b.e.startedAt.localeCompare(a.e.startedAt))[0];
}

/** Unit number of the active unit, if any (for links on "Heute"). */
export function currentUnit(
  enrollments: Record<number, UnitEnrollment>,
  exams: ExamResult[]
): number | null {
  return activeEnrollment(enrollments, exams)?.e.unit ?? null;
}
