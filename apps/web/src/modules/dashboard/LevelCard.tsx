import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import type { Level } from '@suffa/engagement';
import { Icon } from '@/components/Icon';
import { MADINAH_STAGES, STAGES, stageState } from '@/services/enrollment';
import { useBookProgress } from '@/modules/units/useBookProgress';
import { useEnrollmentStore } from '@/state';
import { MADINAH_BOOKS, madinahProgress, useActiveCourse } from '@/services/courses';
import { stageBadge, stageName, stageTest } from '@/modules/units/labels';

/**
 * Where the learner stands: the XP level with the way to the next one, then the book of the
 * course they follow (ADR-0025): for Bayna Yadayk level 1 (Book 1) with the running stage and
 * its badge, for the Medina course Book 1 with its lesson tests.
 */
export function LevelCard({ totalXp, level }: { totalXp: number; level: Level }) {
  const { t } = useTranslation('dashboard');
  const course = useActiveCourse();
  return (
    <Link to="/units" className="card stack level-card" aria-labelledby="level-title">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <span className="eyebrow">{t('level.yourLevel')}</span>
        <span className="badge header-chip">
          <strong style={{ color: 'var(--accent)' }}>
            {t('level.level', { level: level.level })}
          </strong>
          <span>{t('level.xp', { xp: totalXp })}</span>
        </span>
      </div>
      <div className="row" style={{ gap: '0.75rem', flexWrap: 'nowrap' }}>
        <div
          className="review-progress"
          role="progressbar"
          aria-label={t('level.toNext', { level: level.level + 1 })}
          aria-valuemin={0}
          aria-valuemax={level.span}
          aria-valuenow={level.into}
        >
          <div style={{ width: `${(level.into / level.span) * 100}%` }} />
        </div>
        <span className="muted" style={{ whiteSpace: 'nowrap' }}>
          {t('level.xpToNext', { xp: level.span - level.into, level: level.level + 1 })}
        </span>
      </div>
      {course === 'madinah' ? <MadinahBookLevel /> : <BookLevel />}
    </Link>
  );
}

/** The Medina course: Book 1 and its lesson tests passed. */
function MadinahBookLevel() {
  const { t } = useTranslation('dashboard');
  const exams = useEnrollmentStore((s) => s.exams);
  const book = MADINAH_BOOKS[0]!;
  const { lessons, passed, next } = madinahProgress(exams);
  const total = lessons.length;
  const stage =
    MADINAH_STAGES.find((s) => stageState(s, exams).state !== 'done') ??
    MADINAH_STAGES[MADINAH_STAGES.length - 1]!;
  const state = stageState(stage, exams);
  return (
    <>
      <strong
        id="level-title"
        className="level-card-title"
        style={{ fontSize: '1.3rem' }}
      >
        {t('level.madinahTitle', { book: book.book })}
      </strong>
      <div className="row" style={{ gap: '0.75rem', flexWrap: 'nowrap' }}>
        <div
          className="review-progress"
          role="progressbar"
          aria-label={t('level.bookProgress', { book: book.book })}
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={passed}
        >
          <div style={{ width: `${(passed / total) * 100}%` }} />
        </div>
        <span className="muted" style={{ whiteSpace: 'nowrap' }}>
          {t('level.lessonsOf', { done: passed, total })}
        </span>
      </div>
      {next && (
        <span className="muted">
          {t('level.nextLessonTest', { n: next.lesson.lesson })}
        </span>
      )}
      <span className="row muted level-card-stage">
        <Icon name="path" size={16} />
        <span>
          {state.state === 'done'
            ? t('level.bookDone', { book: book.book, badge: stageBadge(stage) })
            : t('level.lessonsToBadge', {
                stage: stageName(stage),
                done: state.state === 'locked' ? 0 : state.unitsPassed,
                total: stage.units.length,
                badge: stageBadge(stage),
              })}
        </span>
      </span>
    </>
  );
}

/** Al-Arabiyya bayna Yadayk: level 1 (Book 1), its running stage and the units passed. */
function BookLevel() {
  const { t } = useTranslation('dashboard');
  const exams = useEnrollmentStore((s) => s.exams);
  const { units } = useBookProgress();
  const passed = units.filter((u) => u.status.state === 'completed').length;
  const stage =
    STAGES.find((s) => stageState(s, exams).state !== 'done') ??
    STAGES[STAGES.length - 1]!;
  const state = stageState(stage, exams);
  const stagePassed = units.filter(
    (u) => stage.units.includes(u.unit.unit) && u.status.state === 'completed'
  ).length;
  const total = units.length || 16;

  return (
    <>
      <strong
        id="level-title"
        className="level-card-title"
        style={{ fontSize: '1.3rem' }}
      >
        {t('level.stageLevel', { level: 1 })} ·{' '}
        <span lang="ar" dir="rtl" className="arabic-inline">
          المستوى الأول
        </span>
      </strong>
      <div className="row" style={{ gap: '0.75rem', flexWrap: 'nowrap' }}>
        <div
          className="review-progress"
          role="progressbar"
          aria-label={t('level.levelProgress', { level: 1 })}
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={passed}
        >
          <div style={{ width: `${(passed / total) * 100}%` }} />
        </div>
        <span className="muted" style={{ whiteSpace: 'nowrap' }}>
          {t('level.unitsOf', { done: passed, total })}
        </span>
      </div>
      <span className="row muted level-card-stage">
        <Icon name="path" size={16} />
        <span>
          {state.state === 'done'
            ? t('level.bookDone', { book: 1, badge: stageBadge(stage) })
            : state.state === 'test-ready'
              ? t('level.testReady', {
                  stage: stageName(stage),
                  test: stageTest(stage),
                  badge: stageBadge(stage),
                })
              : t('level.unitsToBadge', {
                  stage: stageName(stage),
                  done: stagePassed,
                  total: stage.units.length,
                  badge: stageBadge(stage),
                })}
        </span>
      </span>
    </>
  );
}
