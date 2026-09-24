import { Link } from 'react-router-dom';
import { Icon } from '@/components/Icon';
import type { ExamResult, UnitEnrollment } from '@/types';
import { enrollmentStatus } from '@/services/enrollment';
import { useEnrollmentStore } from '@/state';
import { daysLeftLabel } from '@/modules/units/UnitGate';
import { unitToContinue, useBookProgress } from '@/modules/units/useBookProgress';
import { splitUnitTitle } from '@/services/units';

/**
 * "Heute" opens with the learner's unit: the started unit (or the next one to start), the
 * section and station that come next, its countdown and one button to continue right there.
 */
export function CurrentUnitCard() {
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
        Deine Einheit
      </span>
      <h2 id="current-unit" style={{ margin: 0 }}>
        Einheit {unit.unit}
        {name && <span className="muted current-unit-name"> · {name}</span>}
      </h2>
      {started ? (
        <>
          {section && station && (
            <p style={{ margin: 0 }}>
              <strong>{section.label}</strong>
              <span className="muted"> · als Nächstes: {station.label}</span>
            </p>
          )}
          <div className="row" style={{ gap: '0.75rem', flexWrap: 'nowrap' }}>
            <div
              className="review-progress"
              role="progressbar"
              aria-label={`Fortschritt Einheit ${unit.unit}`}
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
                : 'Frist vorbei'}
            </span>
          )}
        </>
      ) : (
        <p className="muted" style={{ margin: 0 }}>
          Wähle dein Tempo und leg mit Dialog 1 los. Noch nie Arabisch gelesen?{' '}
          <Link to="/alphabet">Erst das Alphabet lernen</Link>
        </p>
      )}
      <Link to={to} className="btn btn-primary btn-lg">
        {started ? 'Fortsetzen' : `Einheit ${unit.unit} beginnen`}
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
