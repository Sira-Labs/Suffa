import type { CSSProperties } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Icon, type IconName } from '@/components/Icon';
import {
  arabicNumber,
  splitUnitTitle,
  type Station,
  type StationKind,
} from '@/services/units';
import { useBookProgress, type SkillProgress } from './useBookProgress';

const STATION_ICONS: Record<StationKind, IconName> = {
  dialogue: 'listen',
  words: 'read',
  practice: 'write',
  sounds: 'speak',
  review: 'conjugate',
  vocab: 'cards',
  test: 'exam',
  video: 'play',
  read: 'read',
  write: 'write',
  speak: 'speak',
  verbs: 'conjugate',
};

const SKILL_RINGS: Record<SkillProgress['key'], { label: string; icon: IconName }> = {
  listen: { label: 'Hören', icon: 'listen' },
  words: { label: 'Wörter', icon: 'cards' },
  read: { label: 'Lesen', icon: 'read' },
  write: { label: 'Schreiben', icon: 'write' },
  speak: { label: 'Sprechen', icon: 'speak' },
  verbs: { label: 'Verben', icon: 'conjugate' },
};

function skillLink(unit: number, key: SkillProgress['key']): string {
  if (key === 'words') return `/review?unit=${unit}`;
  return `/units/${unit}/${key}`;
}

/** One unit as a learning path: stations in order, the next one highlighted. */
export function UnitPath() {
  const { unit: param } = useParams();
  const number = Number(param);
  const { index, units } = useBookProgress();
  if (!index) return <p className="muted">Lade Einheit …</p>;
  const entry = units.find((u) => u.unit.unit === number);
  if (!entry) {
    return (
      <div className="stack">
        <h1>Einheit nicht gefunden</h1>
        <Link to="/units" className="btn">
          Zu allen Einheiten
        </Link>
      </div>
    );
  }
  const { unit, title, stations, progress, skills } = entry;
  const prev = units.find((u) => u.unit.unit === number - 1);
  const next = units.find((u) => u.unit.unit === number + 1);

  return (
    <div className="stack" style={{ gap: '1.25rem' }}>
      <Link to="/units" className="back-link">
        <Icon name="arrowLeft" size={18} />
        Alle Einheiten
      </Link>

      <header className="card unit-header">
        <span className="unit-header-number arabic-display" aria-hidden>
          {arabicNumber(unit.unit)}
        </span>
        <span className="eyebrow" style={{ color: 'var(--accent)' }}>
          Einheit {unit.unit}
        </span>
        <UnitTitle title={title} unit={unit.unit} />
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
            {progress.doneStations} von {progress.stations} Stationen
          </span>
        </div>
        {skills.length > 0 && (
          <ul className="skill-rings" aria-label="Fertigkeiten in dieser Einheit">
            {skills.map((skill) => {
              const meta = SKILL_RINGS[skill.key];
              const percent = Math.round((skill.done / skill.total) * 100);
              return (
                <li key={skill.key}>
                  <Link
                    to={skillLink(unit.unit, skill.key)}
                    className="skill-ring"
                    aria-label={`${meta.label}: ${skill.done} von ${skill.total}`}
                    style={{ '--p': `${percent}%` } as CSSProperties}
                  >
                    <span className="skill-ring-dial" aria-hidden>
                      <Icon name={meta.icon} size={16} />
                    </span>
                    <span className="skill-ring-label">{meta.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </header>

      <ol className="path" aria-label={`Lernpfad Einheit ${unit.unit}`}>
        {stations.map((station, i) => (
          <PathStation
            key={station.id}
            station={station}
            last={i === stations.length - 1}
          />
        ))}
      </ol>

      <nav
        className="row"
        style={{ justifyContent: 'space-between' }}
        aria-label="Einheiten"
      >
        {prev ? (
          <Link to={`/units/${prev.unit.unit}`} className="btn">
            Einheit {prev.unit.unit}
          </Link>
        ) : (
          <span />
        )}
        {next && (
          <Link to={`/units/${next.unit.unit}`} className="btn">
            Einheit {next.unit.unit}
          </Link>
        )}
      </nav>
    </div>
  );
}

function UnitTitle({ title, unit }: { title: string | null; unit: number }) {
  if (!title) return <h1>Einheit {unit}</h1>;
  const { ar, de } = splitUnitTitle(title);
  return (
    <h1 className="stack" style={{ gap: '0.25rem' }}>
      {ar && (
        <span lang="ar" dir="rtl" className="arabic-display unit-title-ar">
          {ar}
        </span>
      )}
      <span>{de}</span>
    </h1>
  );
}

/** Stations measured in heard tracks (the others carry their count in the detail line). */
const LISTENING_KINDS = new Set<StationKind>([
  'dialogue',
  'words',
  'practice',
  'sounds',
  'review',
]);

function PathStation({ station, last }: { station: Station; last: boolean }) {
  const stateLabel =
    station.state === 'done'
      ? 'erledigt'
      : station.state === 'current'
        ? 'als Nächstes'
        : '';
  return (
    <li className={`path-station path-station-${station.state}`}>
      <span className="path-rail" aria-hidden>
        <span className="path-marker">
          {station.state === 'done' ? (
            <Icon name="check" size={18} strokeWidth={2.6} />
          ) : (
            <Icon name={STATION_ICONS[station.kind]} size={18} />
          )}
        </span>
        {!last && <span className="path-line" />}
      </span>
      <Link to={station.to} className="path-card">
        <span className="path-card-title">
          {station.label}
          {stateLabel && <span className="visually-hidden"> ({stateLabel})</span>}
        </span>
        <span className="muted path-card-detail">{station.detail}</span>
        {station.state === 'optional' && (
          <span className="muted path-card-detail">Optional · im Buch mitlesen</span>
        )}
        {station.total > 0 && LISTENING_KINDS.has(station.kind) && (
          <span className="muted path-card-detail">
            {station.done}/{station.total} gehört
          </span>
        )}
        {station.state === 'current' && (
          <span className="path-card-cta">Jetzt starten</span>
        )}
      </Link>
    </li>
  );
}
