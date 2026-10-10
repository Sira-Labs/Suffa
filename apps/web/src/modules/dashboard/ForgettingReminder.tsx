import { useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceDot,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from 'recharts';
import type { ReviewLog, SrsCard } from '@/types';
import { daysSinceLastReview, forgettingCurve, isStreakBroken } from '@/services/stats';
import { localDay } from '@/services/today';

/** Days shown on the curve. */
const CURVE_DAYS = 7;
const DISMISS_KEY = 'suffa.forgettingReminder.dismissedOn';

function dismissedToday(): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY) === localDay(new Date());
  } catch {
    return false; // storage blocked: simply show the reminder
  }
}

function rememberDismissal(): void {
  try {
    localStorage.setItem(DISMISS_KEY, localDay(new Date()));
  } catch {
    // storage blocked: the reminder comes back on the next visit, which is acceptable
  }
}

const percentLost = (retention: number) => Math.round((1 - retention) * 100);

/**
 * Shown on "Heute" only after a break (streak broken): the learner's estimated forgetting
 * curve with today marked, and one way back — a short review. Hidden for the rest of the day
 * when dismissed, and gone as soon as the learner reviews again.
 */
export function ForgettingReminder({
  cards,
  logs,
}: {
  cards: SrsCard[];
  logs: ReviewLog[];
}) {
  const { t } = useTranslation('dashboard');
  const [hidden, setHidden] = useState(dismissedToday);
  if (hidden || !isStreakBroken(logs)) return null;

  const days = daysSinceLastReview(logs)!;
  const curve = forgettingCurve(cards, CURVE_DAYS);
  const shownDay = Math.min(days, CURVE_DAYS);
  const afterOneDay = percentLost(curve[1]!.retention);
  const now = percentLost(curve[shownDay]!.retention);

  return (
    <section
      className="card stack forgetting-reminder"
      aria-labelledby="forgetting-title"
    >
      <span className="eyebrow" style={{ color: 'var(--warn)' }}>
        {t('forgetting.eyebrow')}
      </span>
      <h2 id="forgetting-title" style={{ margin: 0 }}>
        {t('forgetting.title', { count: days })}
      </h2>
      <p style={{ margin: 0 }}>
        <Trans
          t={t}
          i18nKey="forgetting.text"
          values={{
            afterOneDay,
            now,
            when:
              days > CURVE_DAYS
                ? t('forgetting.aWeek')
                : t('forgetting.days', { count: days }),
          }}
          components={{ 1: <strong />, 2: <strong /> }}
        />
      </p>
      <div style={{ width: '100%', height: 160 }} aria-hidden>
        <ResponsiveContainer>
          <LineChart data={curve} margin={{ top: 10, right: 12, left: -24, bottom: 0 }}>
            <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
            <XAxis
              dataKey="day"
              stroke="var(--text-muted)"
              tickLine={false}
              tickFormatter={(d: number) =>
                d === 0 ? t('forgetting.lastTime') : `+${d}`
              }
            />
            <YAxis
              domain={[0, 1]}
              stroke="var(--text-muted)"
              tickLine={false}
              tickFormatter={(v: number) => `${Math.round(v * 100)}%`}
            />
            <Line
              type="monotone"
              dataKey="retention"
              stroke="var(--accent)"
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
            <ReferenceDot
              x={shownDay}
              y={curve[shownDay]!.retention}
              r={6}
              fill="var(--bad)"
              stroke="var(--bg)"
              label={{
                value: t('forgetting.today'),
                position: 'top',
                fill: 'var(--text)',
              }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="row">
        <Link to="/review" className="btn btn-primary">
          {t('forgetting.reviewNow')}
        </Link>
        <button
          className="btn"
          onClick={() => {
            rememberDismissal();
            setHidden(true);
          }}
        >
          {t('forgetting.hideToday')}
        </button>
      </div>
    </section>
  );
}
