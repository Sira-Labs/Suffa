import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { UnitPace } from '@/types';
import { Icon } from '@/components/Icon';
import {
  EXTENSION_DAYS,
  PACE_DAYS,
  PACE_LABELS,
  targetDate,
  type EnrollmentStatus,
} from '@/services/enrollment';
import { useEnrollmentStore } from '@/state';

const DUE_FORMAT = new Intl.DateTimeFormat('de-DE', {
  weekday: 'short',
  day: 'numeric',
  month: 'long',
});
const PACES: UnitPace[] = ['relaxed', 'normal', 'intensive'];

/** "noch 7 Tage", "noch 1 Tag", "heute letzter Tag". */
export function daysLeftLabel(days: number): string {
  if (days <= 0) return 'heute letzter Tag';
  return days === 1 ? 'noch 1 Tag' : `noch ${days} Tage`;
}

/** A locked unit: it opens with the previous unit's test. */
export function LockedPanel({ unit }: { unit: number }) {
  return (
    <section className="card stack unit-gate" aria-labelledby="locked-title">
      <span className="row" style={{ gap: '0.5rem', color: 'var(--text-muted)' }}>
        <Icon name="lock" size={20} />
        <h2 id="locked-title" style={{ margin: 0 }}>
          Noch gesperrt
        </h2>
      </span>
      <p style={{ margin: 0 }}>
        Einheit {unit} öffnet sich, sobald du den Test von Einheit {unit - 1} mit
        mindestens 80 % bestanden hast.
      </p>
      <Link
        to={`/units/${unit - 1}`}
        className="btn btn-primary"
        style={{ alignSelf: 'start' }}
      >
        Zu Einheit {unit - 1}
      </Link>
    </section>
  );
}

/** Start a unit: pick a pace, see the target date. */
export function StartPanel({ unit }: { unit: number }) {
  const [pace, setPace] = useState<UnitPace>('normal');
  const start = useEnrollmentStore((s) => s.start);
  const due = targetDate(new Date(), PACE_DAYS[pace]);

  return (
    <section className="card stack unit-gate" aria-labelledby="start-title">
      <h2 id="start-title" style={{ margin: 0 }}>
        Dein Tempo für Einheit {unit}
      </h2>
      <div
        className="stack"
        role="radiogroup"
        aria-labelledby="start-title"
        style={{ gap: '0.5rem' }}
      >
        {PACES.map((p) => (
          <label key={p} className={`pace-option${p === pace ? ' pace-option-on' : ''}`}>
            <input
              type="radio"
              name={`pace-${unit}`}
              value={p}
              checked={p === pace}
              onChange={() => setPace(p)}
            />
            <span className="stack" style={{ gap: 0, flexGrow: 1 }}>
              <strong>{PACE_LABELS[p].label}</strong>
              <span className="muted" style={{ fontSize: '0.9rem' }}>
                {PACE_LABELS[p].minutes}
              </span>
            </span>
            <span className="pace-weeks">
              {PACE_DAYS[p] / 7 === 1 ? '1 Woche' : `${PACE_DAYS[p] / 7} Wochen`}
            </span>
          </label>
        ))}
      </div>
      <p className="muted row" style={{ margin: 0, gap: '0.4rem' }}>
        <Icon name="clock" size={16} />
        Ziel: <strong style={{ color: 'var(--text)' }}>{DUE_FORMAT.format(due)}</strong> ·
        einmal verlängerbar
      </p>
      <button className="btn btn-primary btn-lg" onClick={() => void start(unit, pace)}>
        Einheit {unit} beginnen
      </button>
      <p className="muted" style={{ margin: 0, fontSize: '0.85rem' }}>
        Die nächste Einheit öffnet sich mit dem bestandenen Einheitstest (≥ 80 %).
      </p>
    </section>
  );
}

/** Countdown / overdue / completed chip for the unit header. */
export function DeadlineChip({
  unit,
  status,
}: {
  unit: number;
  status: EnrollmentStatus;
}) {
  const extend = useEnrollmentStore((s) => s.extend);
  if (status.state === 'not-started') return null;
  if (status.state === 'completed') {
    return (
      <span className="badge badge-done header-chip">
        <Icon name="check" size={16} strokeWidth={2.6} />
        Bestanden{status.onTime ? ' · pünktlich' : ''}
      </span>
    );
  }
  if (status.state === 'running') {
    return (
      <span className="badge header-chip deadline-chip">
        <Icon name="clock" size={16} />
        {daysLeftLabel(status.daysLeft)}
        <span className="muted">· bis {DUE_FORMAT.format(status.dueAt)}</span>
      </span>
    );
  }
  return (
    <span className="row" style={{ gap: '0.5rem' }}>
      <span className="badge header-chip deadline-chip deadline-chip-over">
        <Icon name="clock" size={16} />
        Frist seit {status.daysOver === 1 ? '1 Tag' : `${status.daysOver} Tagen`} vorbei
      </span>
      {status.canExtend && (
        <button className="btn" onClick={() => void extend(unit)}>
          Um {EXTENSION_DAYS} Tage verlängern
        </button>
      )}
    </span>
  );
}
