import { Link } from 'react-router-dom';
import { Icon } from '@/components/Icon';
import { enrollmentStatus } from '@/services/enrollment';
import { useEnrollmentStore } from '@/state';
import { daysLeftLabel } from '@/modules/units/UnitGate';

/**
 * "Heute" leads into the unit the learner started: the latest started unit whose test is not
 * passed yet, with its countdown. Nothing is shown before the first unit was started.
 */
export function CurrentUnitCard() {
  const enrollments = useEnrollmentStore((s) => s.enrollments);
  const exams = useEnrollmentStore((s) => s.exams);
  const active = Object.values(enrollments)
    .map((e) => ({ e, status: enrollmentStatus(e, exams, e.unit) }))
    .filter(({ status }) => status.state === 'running' || status.state === 'overdue')
    .sort((a, b) => b.e.startedAt.localeCompare(a.e.startedAt))[0];
  if (!active) return null;

  const { e, status } = active;
  const when =
    status.state === 'running' ? daysLeftLabel(status.daysLeft) : 'Frist vorbei';
  return (
    <Link to={`/units/${e.unit}`} className="card row current-unit-card">
      <span className="stack" style={{ gap: '0.15rem', flexGrow: 1 }}>
        <span className="eyebrow" style={{ color: 'var(--accent)' }}>
          Deine Einheit
        </span>
        <strong>Weiter in Einheit {e.unit}</strong>
        <span
          className="row muted"
          style={{
            gap: '0.35rem',
            color: status.state === 'overdue' ? 'var(--warn)' : undefined,
          }}
        >
          <Icon name="clock" size={15} />
          {when}
        </span>
      </span>
      <Icon name="arrowRight" />
    </Link>
  );
}
