import { useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import type { UnitPace } from '@/types';
import { Icon } from '@/components/Icon';
import {
  EXTENSION_DAYS,
  PACE_DAYS,
  targetDate,
  type EnrollmentStatus,
} from '@/services/enrollment';
import i18n from '@/i18n';
import { dateLocale } from '@/i18n/format';
import { useEnrollmentStore } from '@/state';

const dueDate = (date: Date) =>
  new Intl.DateTimeFormat(dateLocale(), {
    weekday: 'short',
    day: 'numeric',
    month: 'long',
  }).format(date);
const PACES: UnitPace[] = ['relaxed', 'normal', 'intensive'];

/** "noch 7 Tage", "noch 1 Tag", "heute letzter Tag". */
export function daysLeftLabel(days: number): string {
  if (days <= 0) return i18n.t('units:gate.lastDay');
  return i18n.t('units:gate.daysLeft', { count: days });
}

/** A locked unit: it opens with the previous unit's test. */
export function LockedPanel({ unit }: { unit: number }) {
  const { t } = useTranslation('units');
  return (
    <section className="card stack unit-gate" aria-labelledby="locked-title">
      <span className="row" style={{ gap: '0.5rem', color: 'var(--text-muted)' }}>
        <Icon name="lock" size={20} />
        <h2 id="locked-title" style={{ margin: 0 }}>
          {t('gate.lockedTitle')}
        </h2>
      </span>
      <p style={{ margin: 0 }}>{t('gate.lockedText', { unit, previous: unit - 1 })}</p>
      <Link
        to={`/units/${unit - 1}`}
        className="btn btn-primary"
        style={{ alignSelf: 'start' }}
      >
        {t('gate.toUnit', { n: unit - 1 })}
      </Link>
    </section>
  );
}

/** Start a unit: pick a pace, see the target date. */
export function StartPanel({ unit }: { unit: number }) {
  const { t } = useTranslation('units');
  const [pace, setPace] = useState<UnitPace>('normal');
  const start = useEnrollmentStore((s) => s.start);
  const due = targetDate(new Date(), PACE_DAYS[pace]);

  return (
    <section className="card stack unit-gate" aria-labelledby="start-title">
      <h2 id="start-title" style={{ margin: 0 }}>
        {t('gate.paceTitle', { n: unit })}
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
              <strong>{t(`gate.pace.${p}.label`)}</strong>
              <span className="muted" style={{ fontSize: '0.9rem' }}>
                {t(`gate.pace.${p}.minutes`)}
              </span>
            </span>
            <span className="pace-weeks">
              {t('gate.weeks', { count: PACE_DAYS[p] / 7 })}
            </span>
          </label>
        ))}
      </div>
      <p className="muted row" style={{ margin: 0, gap: '0.4rem' }}>
        <Icon name="clock" size={16} />
        <Trans
          t={t}
          i18nKey="gate.target"
          values={{ date: dueDate(due) }}
          components={{ 1: <strong style={{ color: 'var(--text)' }} /> }}
        />
      </p>
      <button className="btn btn-primary btn-lg" onClick={() => void start(unit, pace)}>
        {t('gate.start', { n: unit })}
      </button>
      <p className="muted" style={{ margin: 0, fontSize: '0.85rem' }}>
        {t('gate.nextUnitHint')}
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
  const { t } = useTranslation('units');
  const extend = useEnrollmentStore((s) => s.extend);
  if (status.state === 'not-started') return null;
  if (status.state === 'completed') {
    return (
      <span className="badge badge-done header-chip">
        <Icon name="check" size={16} strokeWidth={2.6} />
        {status.onTime ? t('gate.passedOnTime') : t('gate.passed')}
      </span>
    );
  }
  if (status.state === 'running') {
    return (
      <span className="badge header-chip deadline-chip">
        <Icon name="clock" size={16} />
        {daysLeftLabel(status.daysLeft)}
        <span className="muted">{t('gate.until', { date: dueDate(status.dueAt) })}</span>
      </span>
    );
  }
  return (
    <span className="row" style={{ gap: '0.5rem' }}>
      <span className="badge header-chip deadline-chip deadline-chip-over">
        <Icon name="clock" size={16} />
        {t('gate.overdue', { count: status.daysOver })}
      </span>
      {status.canExtend && (
        <button className="btn" onClick={() => void extend(unit)}>
          {t('gate.extend', { days: EXTENSION_DAYS })}
        </button>
      )}
    </span>
  );
}
