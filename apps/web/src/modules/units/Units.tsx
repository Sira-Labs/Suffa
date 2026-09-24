import { Link } from 'react-router-dom';
import { Icon } from '@/components/Icon';
import { arabicNumber, splitUnitTitle } from '@/services/units';
import { STAGES, stageState, type Stage, type StageState } from '@/services/enrollment';
import { useEnrollmentStore } from '@/state';
import { useBookProgress, type UnitOverview } from './useBookProgress';

/**
 * Level map (step 3): Book 1 = level 1, in two stages of eight units that each end with a
 * stage test; the unit to continue is highlighted on top.
 */
export function Units() {
  const { units } = useBookProgress();
  const exams = useEnrollmentStore((s) => s.exams);
  if (units.length === 0) return <p className="muted">Lade Einheiten …</p>;
  // The unit to continue: the first open one whose test is not passed yet.
  const current =
    units.find((u) => u.unlocked && u.status.state !== 'completed') ??
    units[units.length - 1]!;

  return (
    <div className="stack" style={{ gap: '1.5rem' }}>
      <header className="stack" style={{ gap: '0.25rem' }}>
        <span className="eyebrow">Al-Arabiyya bayna Yadayk</span>
        <h1>
          Stufe 1 ·{' '}
          <span lang="ar" dir="rtl" className="arabic-display level-title-ar">
            المستوى الأول
          </span>
        </h1>
        <LevelProgress units={units} />
      </header>

      <Link to={`/units/${current.unit.unit}`} className="card unit-hero">
        <span className="unit-hero-number arabic-display" aria-hidden>
          {arabicNumber(current.unit.unit)}
        </span>
        <span className="stack" style={{ gap: '0.35rem' }}>
          <span className="eyebrow" style={{ color: 'var(--accent)' }}>
            Weiter in Einheit {current.unit.unit}
          </span>
          {current.title ? (
            <HeroTitle title={current.title} />
          ) : (
            <strong style={{ fontSize: '1.15rem' }}>Einheit {current.unit.unit}</strong>
          )}
          <span className="muted">
            {current.progress.doneStations} von {current.progress.stations} Stationen ·{' '}
            {current.progress.percent} %
          </span>
        </span>
        <Icon name="arrowRight" />
      </Link>

      {STAGES.map((stage) => (
        <StageCard
          key={stage.id}
          stage={stage}
          state={stageState(stage, exams)}
          units={units.filter((u) => stage.units.includes(u.unit.unit))}
          currentUnit={current.unit.unit}
        />
      ))}
    </div>
  );
}

function HeroTitle({ title }: { title: string }) {
  const { ar, de } = splitUnitTitle(title);
  return (
    <span className="stack" style={{ gap: 0 }}>
      {ar && (
        <span
          lang="ar"
          dir="rtl"
          className="arabic-display"
          style={{ fontSize: '1.4rem', textAlign: 'left' }}
        >
          {ar}
        </span>
      )}
      <strong style={{ fontSize: '1.05rem' }}>{de}</strong>
    </span>
  );
}

function LevelProgress({ units }: { units: UnitOverview[] }) {
  const passed = units.filter((u) => u.status.state === 'completed').length;
  return (
    <div className="row" style={{ gap: '0.75rem', flexWrap: 'nowrap' }}>
      <div
        className="review-progress"
        role="progressbar"
        aria-label="Fortschritt Stufe 1"
        aria-valuemin={0}
        aria-valuemax={units.length}
        aria-valuenow={passed}
      >
        <div style={{ width: `${(passed / Math.max(1, units.length)) * 100}%` }} />
      </div>
      <span className="muted" style={{ whiteSpace: 'nowrap' }}>
        {passed} von {units.length} Einheiten
      </span>
    </div>
  );
}

const STAGE_BADGE: Record<StageState['state'], string> = {
  locked: 'gesperrt',
  running: 'läuft',
  'test-ready': 'Test bereit',
  done: 'geschafft',
};

function StageCard({
  stage,
  state,
  units: stageUnits,
  currentUnit,
}: {
  stage: Stage;
  state: StageState;
  units: UnitOverview[];
  currentUnit: number;
}) {
  const first = stage.units[0];
  const last = stage.units[stage.units.length - 1];
  return (
    <section
      className={`card stack stage-card stage-card-${state.state}`}
      aria-labelledby={`stage-${stage.id}`}
    >
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h2 id={`stage-${stage.id}`} style={{ margin: 0, fontSize: '1.1rem' }}>
          {stage.name} · Einheit {first}–{last}
        </h2>
        <span className="stage-badge">{STAGE_BADGE[state.state]}</span>
      </div>
      <ol className="unit-grid" aria-label={`${stage.name}: Einheiten`}>
        {stageUnits.map(({ unit, title, progress, unlocked, status }) => (
          <li key={unit.unit}>
            <Link
              to={`/units/${unit.unit}`}
              className={`unit-tile${unit.unit === currentUnit ? ' unit-tile-current' : ''}${status.state === 'completed' ? ' unit-tile-done' : ''}${unlocked ? '' : ' unit-tile-locked'}`}
              aria-label={`Einheit ${unit.unit}${title ? `, ${title}` : ''}, ${unlocked ? `${progress.percent} % erledigt` : 'gesperrt'}`}
            >
              <span className="unit-tile-number arabic-display" aria-hidden>
                {arabicNumber(unit.unit)}
              </span>
              <span className="unit-tile-label">
                {status.state === 'completed' && (
                  <Icon name="check" size={16} strokeWidth={2.6} />
                )}
                {!unlocked && <Icon name="lock" size={14} />}
                Einheit {unit.unit}
              </span>
              <span className="unit-tile-bar" aria-hidden>
                <span style={{ width: `${progress.percent}%` }} />
              </span>
            </Link>
          </li>
        ))}
      </ol>
      <StageTestRow stage={stage} state={state} />
    </section>
  );
}

function StageTestRow({ stage, state }: { stage: Stage; state: StageState }) {
  if (state.state === 'done') {
    return (
      <Link to={`/milestone/${stage.id}`} className="stage-test stage-test-done">
        <Icon name="check" size={18} strokeWidth={2.6} />
        <span>
          <strong>{stage.test}</strong> bestanden · Abzeichen „{stage.badge}“
        </span>
      </Link>
    );
  }
  if (state.state === 'test-ready') {
    return (
      <Link to={`/exam?stage=${stage.id}`} className="btn btn-primary">
        {stage.test} starten
      </Link>
    );
  }
  return (
    <p className="stage-test muted">
      <Icon name={state.state === 'locked' ? 'lock' : 'exam'} size={18} />
      <span>
        <strong style={{ color: 'var(--text)' }}>{stage.test}</strong>{' '}
        {state.state === 'locked'
          ? 'nach der vorigen Etappe'
          : `öffnet nach allen Einheitstests (${state.unitsPassed} von ${stage.units.length})`}
      </span>
    </p>
  );
}
