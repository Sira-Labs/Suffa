import { Link } from 'react-router-dom';
import { Icon } from '@/components/Icon';
import { STAGES, stageState } from '@/services/enrollment';
import { useBookProgress } from '@/modules/units/useBookProgress';
import { useEnrollmentStore } from '@/state';

/**
 * Where the learner stands: level 1 (Book 1), the running stage with its badge, units passed
 * and all XP earned so far. Replaces the old mastery bar on "Heute".
 */
export function LevelCard({ totalXp }: { totalXp: number }) {
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
    <Link to="/units" className="card stack level-card" aria-labelledby="level-title">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <span className="eyebrow">Dein Level</span>
        <span className="badge header-chip">
          <strong style={{ color: 'var(--accent)' }}>{totalXp} XP</strong>
          <span>gesamt</span>
        </span>
      </div>
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
    </Link>
  );
}
