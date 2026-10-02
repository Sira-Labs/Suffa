import { Link } from 'react-router-dom';
import type { Level } from '@suffa/engagement';
import { Icon } from '@/components/Icon';
import { MADINAH_STAGES, STAGES, stageState } from '@/services/enrollment';
import { useBookProgress } from '@/modules/units/useBookProgress';
import { useEnrollmentStore } from '@/state';
import { MADINAH_BOOKS, madinahProgress, useActiveCourse } from '@/services/courses';

/**
 * Where the learner stands: the XP level with the way to the next one, then the book of the
 * course they follow (ADR-0025): for Bayna Yadayk level 1 (Book 1) with the running stage and
 * its badge, for the Medina course Book 1 with its lesson tests.
 */
export function LevelCard({ totalXp, level }: { totalXp: number; level: Level }) {
  const course = useActiveCourse();
  return (
    <Link to="/units" className="card stack level-card" aria-labelledby="level-title">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <span className="eyebrow">Dein Level</span>
        <span className="badge header-chip">
          <strong style={{ color: 'var(--accent)' }}>Level {level.level}</strong>
          <span>{totalXp} XP</span>
        </span>
      </div>
      <div className="row" style={{ gap: '0.75rem', flexWrap: 'nowrap' }}>
        <div
          className="review-progress"
          role="progressbar"
          aria-label={`Weg zu Level ${level.level + 1}`}
          aria-valuemin={0}
          aria-valuemax={level.span}
          aria-valuenow={level.into}
        >
          <div style={{ width: `${(level.into / level.span) * 100}%` }} />
        </div>
        <span className="muted" style={{ whiteSpace: 'nowrap' }}>
          noch {level.span - level.into} XP bis Level {level.level + 1}
        </span>
      </div>
      {course === 'madinah' ? <MadinahBookLevel /> : <BookLevel />}
    </Link>
  );
}

/** The Medina course: Book 1 and its lesson tests passed. */
function MadinahBookLevel() {
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
        Medina-Kurs · Buch {book.book}
      </strong>
      <div className="row" style={{ gap: '0.75rem', flexWrap: 'nowrap' }}>
        <div
          className="review-progress"
          role="progressbar"
          aria-label={`Fortschritt Buch ${book.book}`}
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={passed}
        >
          <div style={{ width: `${(passed / total) * 100}%` }} />
        </div>
        <span className="muted" style={{ whiteSpace: 'nowrap' }}>
          {passed} von {total} Lektionen
        </span>
      </div>
      {next && (
        <span className="muted">
          Als Nächstes: Lektionstest Lektion {next.lesson.lesson}
        </span>
      )}
      <span className="row muted level-card-stage">
        <Icon name="path" size={16} />
        <span>
          {state.state === 'done'
            ? `Buch ${book.book} geschafft – Abzeichen „${stage.badge}“`
            : `${stage.name}: ${state.state === 'locked' ? 0 : state.unitsPassed} von ${stage.units.length} Lektionen bis zum Abzeichen „${stage.badge}“`}
        </span>
      </span>
    </>
  );
}

/** Al-Arabiyya bayna Yadayk: level 1 (Book 1), its running stage and the units passed. */
function BookLevel() {
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
        Stufe 1 ·{' '}
        <span lang="ar" dir="rtl" className="arabic-inline">
          المستوى الأول
        </span>
      </strong>
      <div className="row" style={{ gap: '0.75rem', flexWrap: 'nowrap' }}>
        <div
          className="review-progress"
          role="progressbar"
          aria-label="Fortschritt Stufe 1"
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={passed}
        >
          <div style={{ width: `${(passed / total) * 100}%` }} />
        </div>
        <span className="muted" style={{ whiteSpace: 'nowrap' }}>
          {passed} von {total} Einheiten
        </span>
      </div>
      <span className="row muted level-card-stage">
        <Icon name="path" size={16} />
        <span>
          {state.state === 'done'
            ? `Buch 1 geschafft – Abzeichen „${stage.badge}“`
            : state.state === 'test-ready'
              ? `${stage.name}: ${stage.test} bereit – Abzeichen „${stage.badge}“`
              : `${stage.name}: ${stagePassed} von ${stage.units.length} Einheiten bis zum Abzeichen „${stage.badge}“`}
        </span>
      </span>
    </>
  );
}
