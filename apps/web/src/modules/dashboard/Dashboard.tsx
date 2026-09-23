import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';
import type { ReviewLog } from '@/types';
import { reviewLogRepo } from '@/services/storage';
import {
  computeStreak,
  forgettingCurve,
  masteryBuckets,
  nextRecommendation,
  reviewHeatmap,
} from '@/services/stats';
import { useSrsStore } from '@/state';

export function Dashboard() {
  const cards = useSrsStore((s) => s.cards);
  const summary = useSrsStore((s) => s.summary)();
  const [logs, setLogs] = useState<ReviewLog[]>([]);

  useEffect(() => {
    void reviewLogRepo.all().then(setLogs);
  }, [cards]);

  const mastery = masteryBuckets(cards);
  const streak = computeStreak(logs);
  const curve = forgettingCurve(cards);
  const heat = reviewHeatmap(logs);
  const rec = nextRecommendation(summary.dueCount, summary.newCount, summary.leechCount);
  const maxHeat = Math.max(1, ...heat.map((h) => h.count));

  return (
    <div className="stack">
      <h1 style={{ margin: 0 }}>Übersicht</h1>

      <div
        className="grid"
        style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}
      >
        <Stat label="Fällig heute" value={summary.dueCount} accent="var(--info)" />
        <Stat label="Neu verfügbar" value={summary.newCount} accent="var(--accent)" />
        <Stat label="Streak" value={`${streak} 🔥`} accent="var(--warn)" />
        <Stat label="Reif" value={mastery.reif} accent="var(--good)" />
        <Stat label="Schwierig" value={summary.leechCount} accent="var(--bad)" />
      </div>

      <div className="card stack">
        <strong>Was als Nächstes?</strong>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <span>{rec.text}</span>
          <Link className="btn btn-accent" to={rec.to}>
            Los geht’s
          </Link>
        </div>
      </div>

      <div className="card stack">
        <strong>Beherrschung</strong>
        <MasteryBar mastery={mastery} />
      </div>

      <div className="card stack">
        <strong>Vergessenskurve (geschätzte Retention ohne Wiederholung)</strong>
        <div style={{ width: '100%', height: 220 }}>
          <ResponsiveContainer>
            <LineChart data={curve} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
              <XAxis
                dataKey="day"
                stroke="var(--text-muted)"
                tickLine={false}
                label={{
                  value: 'Tage',
                  position: 'insideBottom',
                  offset: -2,
                  fill: 'var(--text-muted)',
                }}
              />
              <YAxis domain={[0, 1]} stroke="var(--text-muted)" tickLine={false} />
              <Tooltip
                contentStyle={{
                  background: 'var(--bg-elev-2)',
                  border: '1px solid var(--border)',
                }}
                formatter={(v: number) => [`${Math.round(v * 100)} %`, 'Retention']}
              />
              <Line
                type="monotone"
                dataKey="retention"
                stroke="var(--accent)"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="card stack">
        <strong>Aktivität (letzte 28 Tage)</strong>
        <div className="row" style={{ gap: 4 }} aria-label="Wiederholungs-Heatmap">
          {heat.map((cell) => {
            const intensity = cell.count / maxHeat;
            return (
              <span
                key={cell.date}
                title={`${cell.date}: ${cell.count} Wiederholungen`}
                style={{
                  width: 16,
                  height: 16,
                  borderRadius: 3,
                  background:
                    cell.count === 0
                      ? 'var(--bg-elev-2)'
                      : `color-mix(in srgb, var(--accent) ${20 + intensity * 80}%, transparent)`,
                }}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: number | string;
  accent: string;
}) {
  return (
    <div className="card" style={{ textAlign: 'center' }}>
      <div style={{ fontSize: '1.8rem', fontWeight: 700, color: accent }}>{value}</div>
      <div className="muted">{label}</div>
    </div>
  );
}

function MasteryBar({ mastery }: { mastery: ReturnType<typeof masteryBuckets> }) {
  const segments = [
    { key: 'neu', value: mastery.neu, color: 'var(--accent)', label: 'Neu' },
    { key: 'lernend', value: mastery.lernend, color: 'var(--info)', label: 'Lernend' },
    { key: 'reif', value: mastery.reif, color: 'var(--good)', label: 'Reif' },
  ];
  const total = Math.max(1, mastery.neu + mastery.lernend + mastery.reif);
  return (
    <div className="stack" style={{ gap: '0.5rem' }}>
      <div style={{ display: 'flex', height: 16, borderRadius: 8, overflow: 'hidden' }}>
        {segments.map((s) => (
          <div
            key={s.key}
            style={{ width: `${(s.value / total) * 100}%`, background: s.color }}
          />
        ))}
      </div>
      <div className="row" style={{ gap: '1rem' }}>
        {segments.map((s) => (
          <span key={s.key} className="muted">
            <span style={{ color: s.color }}>●</span> {s.label}: {s.value}
          </span>
        ))}
      </div>
    </div>
  );
}
