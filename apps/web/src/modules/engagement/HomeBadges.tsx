/**
 * Badges on "Heute" (tester feedback after R6: badges motivate only when they are seen). The
 * medals reached so far, newest first, in their tier's colour, and the two badges closest to
 * their next tier with how far there is to go. The full gallery stays on /badges.
 */
import { Link } from 'react-router-dom';
import type { BadgeProgress, Tier } from '@suffa/engagement';
import { Icon } from '@/components/Icon';

export const TIER_LABEL: Record<Tier, string> = {
  bronze: 'Bronze',
  silver: 'Silber',
  gold: 'Gold',
};
const TIERS: readonly Tier[] = ['bronze', 'silver', 'gold'];

/** How many medals and "almost there" rows the card shows. */
const SHOWN_MEDALS = 4;
const SHOWN_CLOSE = 2;

export interface HomeBadgeView {
  /** Badges with at least one tier, newest unlock first. */
  earned: BadgeProgress[];
  /** Badges with a next tier, closest first (ones already under way before untouched ones). */
  close: BadgeProgress[];
  reached: number;
  possible: number;
}

/** Picks what the home card shows from the full badge list. */
export function homeBadges(badges: BadgeProgress[]): HomeBadgeView {
  const newest = (b: BadgeProgress) =>
    Date.parse(b.unlocks.at(-1)?.unlockedAt ?? '') || 0;
  const share = (b: BadgeProgress) => (b.next ? Math.min(b.count, b.next) / b.next : 0);
  return {
    earned: badges
      .filter((b) => b.unlocks.length > 0)
      .sort((a, b) => newest(b) - newest(a)),
    close: badges
      .filter((b) => b.next !== null)
      .sort((a, b) => share(b) - share(a) || (a.next ?? 0) - (b.next ?? 0)),
    reached: badges.reduce((n, b) => n + b.unlocks.length, 0),
    possible: badges.reduce((n, b) => n + b.badge.thresholds.length, 0),
  };
}

export function HomeBadges({ badges }: { badges: BadgeProgress[] }) {
  const view = homeBadges(badges);
  return (
    <section className="card stack home-badges" aria-labelledby="home-badges-title">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div className="stack" style={{ gap: 2 }}>
          <h2 id="home-badges-title" className="eyebrow" style={{ margin: 0 }}>
            Deine Abzeichen
          </h2>
          <span className="muted" style={{ fontSize: '0.9rem' }}>
            {view.reached} von {view.possible} Stufen erreicht
          </span>
        </div>
        <Link to="/badges" className="btn">
          Alle ansehen
        </Link>
      </div>

      {view.earned.length > 0 ? (
        <ul className="home-medals" aria-label="Erreichte Abzeichen">
          {view.earned.slice(0, SHOWN_MEDALS).map((b) => {
            const top = b.unlocks.at(-1)!;
            return (
              <li key={b.badge.id} className={`home-medal badge-card-${top.tier}`}>
                <span className="badge-medal" aria-hidden>
                  <Icon name="award" size={22} />
                </span>
                <strong>{b.badge.name}</strong>
                <span className="muted">{TIER_LABEL[top.tier]}</span>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="muted" style={{ margin: 0 }}>
          Noch kein Abzeichen – das erste ist nah:
        </p>
      )}

      {view.close.length > 0 && (
        <ul className="home-close" aria-label="Fast geschafft">
          {view.close.slice(0, SHOWN_CLOSE).map((b) => {
            const next = b.next!;
            const done = Math.min(b.count, next);
            const tier = TIERS[b.unlocks.length] ?? 'gold';
            return (
              <li key={b.badge.id} className="stack" style={{ gap: '0.3rem' }}>
                <span className="row" style={{ justifyContent: 'space-between' }}>
                  <strong>
                    {b.badge.name} · {TIER_LABEL[tier]}
                  </strong>
                  <span className="muted">noch {next - done}</span>
                </span>
                <span className="muted" style={{ fontSize: '0.85rem' }}>
                  {b.badge.rule.replace('{n}', String(next))} – {done} von {next}
                </span>
                <div
                  className="review-progress"
                  role="progressbar"
                  aria-label={`${b.badge.name}: Weg zu ${TIER_LABEL[tier]}`}
                  aria-valuemin={0}
                  aria-valuemax={next}
                  aria-valuenow={done}
                >
                  <div style={{ width: `${(done / next) * 100}%` }} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
