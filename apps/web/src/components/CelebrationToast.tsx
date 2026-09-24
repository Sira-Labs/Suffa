import { useEffect, type CSSProperties } from 'react';
import { useCelebrationStore } from '@/state';
import { Icon } from './Icon';

const VISIBLE_MS = 2800;
/** Burst particles: angle (deg) and distance (px), in the two brand accents. */
const PARTICLES = Array.from({ length: 14 }, (_, i) => ({
  angle: (360 / 14) * i + (i % 2 ? 8 : -8),
  distance: 46 + (i % 3) * 14,
  teal: i % 2 === 0,
}));

/**
 * "+5 XP" moment after finishing something. Announced politely to screen readers; the burst is
 * decorative and disabled under prefers-reduced-motion (global rule).
 */
export function CelebrationToast() {
  const current = useCelebrationStore((s) => s.current);
  const dismiss = useCelebrationStore((s) => s.dismiss);

  useEffect(() => {
    if (!current) return;
    const timer = setTimeout(dismiss, VISIBLE_MS);
    return () => clearTimeout(timer);
  }, [current, dismiss]);

  return (
    <div className="celebration-region" role="status" aria-live="polite">
      {current && (
        <div
          key={current.id}
          className={`celebration${current.big ? ' celebration-big' : ''}`}
          onClick={dismiss}
        >
          <span className="celebration-burst" aria-hidden>
            {PARTICLES.map((p, i) => (
              <span
                key={i}
                className={`celebration-particle${p.teal ? ' celebration-particle-teal' : ''}`}
                style={
                  {
                    '--angle': `${p.angle}deg`,
                    '--distance': `${p.distance * (current.big ? 1.5 : 1)}px`,
                  } as CSSProperties
                }
              />
            ))}
            <span className="celebration-medal">
              <Icon name="check" size={current.big ? 30 : 24} strokeWidth={2.6} />
            </span>
          </span>
          <span className="celebration-text">
            {current.xp > 0 && (
              <strong className="celebration-xp">+{current.xp} XP</strong>
            )}
            <span>{current.title}</span>
          </span>
        </div>
      )}
    </div>
  );
}
