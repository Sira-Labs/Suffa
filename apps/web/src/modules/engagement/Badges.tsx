import { Trans, useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import type { BadgeProgress, Tier } from '@suffa/engagement';
import { Icon } from '@/components/Icon';
import { dateLocale } from '@/i18n/format';
import { useEngagement } from './useEngagement';
import { MyCertificates } from './MyCertificates';
import { badgeMeaning, badgeName, badgeRule, tierLabel } from './labels';
const TIERS: readonly Tier[] = ['bronze', 'silver', 'gold'];
const date = (iso: string) =>
  new Intl.DateTimeFormat(dateLocale(), {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(iso));

/**
 * Badge gallery (story 5.3): every badge with the tiers reached and the way to the next.
 * Badges are derived from synced history, so they come back after a reinstall.
 */
export function Badges() {
  const { t } = useTranslation('engagement');
  const summary = useEngagement();
  const earned = summary.badges.reduce((n, b) => n + b.unlocks.length, 0);
  const possible = summary.badges.reduce((n, b) => n + b.badge.thresholds.length, 0);
  const { level } = summary;

  return (
    <div className="stack" style={{ gap: '1.5rem' }}>
      <header className="stack" style={{ gap: '0.25rem' }}>
        <span className="eyebrow">{t('gallery.eyebrow')}</span>
        <h1>{t('gallery.title')}</h1>
        <p className="muted" style={{ margin: 0 }}>
          {t('gallery.summary', {
            level: level.level,
            xp: summary.totalXp,
            earned,
            possible,
          })}
        </p>
      </header>
      <ul className="badge-grid">
        {summary.badges.map((b) => (
          <BadgeCard key={b.badge.id} progress={b} />
        ))}
      </ul>
      <MyCertificates />
      <p className="muted" style={{ margin: 0 }}>
        <Trans t={t} i18nKey="gallery.footer" components={{ 1: <Link to="/" /> }} />
      </p>
    </div>
  );
}

function BadgeCard({ progress }: { progress: BadgeProgress }) {
  const { t } = useTranslation('engagement');
  const { badge, count, unlocks, next } = progress;
  const top = unlocks.at(-1);
  const tiered = badge.thresholds.length > 1;
  const name = badgeName(badge);
  const rule = (n: number) => badgeRule(badge, n);
  return (
    <li
      className={`card stack badge-card${top ? ` badge-card-${top.tier}` : ' badge-card-locked'}`}
    >
      <div className="row" style={{ gap: '0.75rem', flexWrap: 'nowrap' }}>
        <span className="badge-medal" aria-hidden>
          <Icon name={top ? 'award' : 'lock'} size={22} />
        </span>
        <span className="stack" style={{ gap: 0 }}>
          <strong>{name}</strong>
          <span className="muted" style={{ fontSize: '0.85rem' }}>
            <span lang="ar" dir="rtl" className="arabic-inline">
              {badge.arabic}
            </span>{' '}
            · {badgeMeaning(badge)}
          </span>
        </span>
      </div>
      {tiered && (
        <ol className="badge-tiers" aria-label={t('gallery.tiers')}>
          {badge.thresholds.map((threshold, i) => {
            const tier = TIERS[i]!;
            const reached = unlocks.find((u) => u.tier === tier);
            return (
              <li
                key={tier}
                className={`badge-tier badge-tier-${tier}${reached ? ' badge-tier-reached' : ''}`}
                title={
                  reached
                    ? t('gallery.reachedOn', { date: date(reached.unlockedAt) })
                    : rule(threshold)
                }
              >
                {tierLabel(tier)} · {threshold}
                {reached && (
                  <span className="visually-hidden">{` (${t('gallery.reached')})`}</span>
                )}
              </li>
            );
          })}
        </ol>
      )}
      <span className="muted" style={{ fontSize: '0.9rem' }}>
        {next === null
          ? top && t('gallery.reachedOnCapital', { date: date(top.unlockedAt) })
          : t('gallery.progress', {
              rule: rule(next),
              done: Math.min(count, next),
              total: next,
            })}
      </span>
      {next !== null && (
        <span
          className="review-progress"
          role="progressbar"
          aria-label={t('gallery.progressLabel', { badge: name })}
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
