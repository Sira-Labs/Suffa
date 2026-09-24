import { Link } from 'react-router-dom';
import type { BadgeProgress, Tier } from '@suffa/engagement';
import { Icon } from '@/components/Icon';
import { useEngagement } from './useEngagement';

const TIER_LABEL: Record<Tier, string> = {
  bronze: 'Bronze',
  silver: 'Silber',
  gold: 'Gold',
};
const TIERS: readonly Tier[] = ['bronze', 'silver', 'gold'];
const DATE = new Intl.DateTimeFormat('de-DE', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

/**
 * Badge gallery (story 5.3): every badge with the tiers reached and the way to the next.
 * Badges are derived from synced history, so they come back after a reinstall.
 */
export function Badges() {
  const summary = useEngagement();
  const earned = summary.badges.reduce((n, b) => n + b.unlocks.length, 0);
  const possible = summary.badges.reduce((n, b) => n + b.badge.thresholds.length, 0);
  const { level } = summary;

  return (
    <div className="stack" style={{ gap: '1.5rem' }}>
      <header className="stack" style={{ gap: '0.25rem' }}>
        <span className="eyebrow">Deine Erfolge</span>
        <h1>Abzeichen</h1>
        <p className="muted" style={{ margin: 0 }}>
          Level {level.level} · {summary.totalXp} XP · {earned} von {possible} Stufen
          erreicht
        </p>
      </header>
      <ul className="badge-grid">
        {summary.badges.map((b) => (
          <BadgeCard key={b.badge.id} progress={b} />
        ))}
      </ul>
      <p className="muted" style={{ margin: 0 }}>
        Abzeichen gehen nie verloren. Sie ergeben sich aus deinem Lernverlauf und kommen
        nach einer Neuinstallation mit der Synchronisierung zurück.{' '}
        <Link to="/">Zu den Tagesaufgaben</Link>
      </p>
    </div>
  );
}

function BadgeCard({ progress }: { progress: BadgeProgress }) {
  const { badge, count, unlocks, next } = progress;
  const top = unlocks.at(-1);
  const tiered = badge.thresholds.length > 1;
  const rule = (n: number) => badge.rule.replace('{n}', String(n));
  return (
    <li
      className={`card stack badge-card${top ? ` badge-card-${top.tier}` : ' badge-card-locked'}`}
    >
      <div className="row" style={{ gap: '0.75rem', flexWrap: 'nowrap' }}>
        <span className="badge-medal" aria-hidden>
          <Icon name={top ? 'award' : 'lock'} size={22} />
        </span>
        <span className="stack" style={{ gap: 0 }}>
          <strong>{badge.name}</strong>
          <span className="muted" style={{ fontSize: '0.85rem' }}>
            <span lang="ar" dir="rtl" className="arabic-inline">
              {badge.arabic}
            </span>{' '}
            · {badge.meaning}
          </span>
        </span>
      </div>
      {tiered && (
        <ol className="badge-tiers" aria-label="Stufen">
          {badge.thresholds.map((threshold, i) => {
            const tier = TIERS[i]!;
            const reached = unlocks.find((u) => u.tier === tier);
            return (
              <li
                key={tier}
                className={`badge-tier badge-tier-${tier}${reached ? ' badge-tier-reached' : ''}`}
                title={
                  reached
                    ? `erreicht am ${DATE.format(new Date(reached.unlockedAt))}`
                    : rule(threshold)
                }
              >
                {TIER_LABEL[tier]} · {threshold}
                {reached && <span className="visually-hidden"> (erreicht)</span>}
              </li>
            );
          })}
        </ol>
      )}
      <span className="muted" style={{ fontSize: '0.9rem' }}>
        {next === null
          ? top && `Erreicht am ${DATE.format(new Date(top.unlockedAt))}`
          : `${rule(next)} – ${Math.min(count, next)} von ${next}`}
      </span>
      {next !== null && (
        <span
          className="review-progress"
          role="progressbar"
          aria-label={`${badge.name}: Fortschritt`}
          aria-valuemin={0}
          aria-valuemax={next}
          aria-valuenow={Math.min(count, next)}
        >
          <span
            style={{
              display: 'block',
              height: '100%',
              width: `${(Math.min(count, next) / next) * 100}%`,
            }}
          />
        </span>
      )}
    </li>
  );
}
