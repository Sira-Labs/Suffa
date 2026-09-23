import { Link } from 'react-router-dom';
import { Icon } from '@/components/Icon';
import { arabicNumber, splitUnitTitle } from '@/services/units';
import { useBookProgress } from './useBookProgress';

/** Book map: all 16 units of Book 1 with progress; the first unfinished one is highlighted. */
export function Units() {
  const { units } = useBookProgress();
  if (units.length === 0) return <p className="muted">Lade Einheiten …</p>;
  const current = units.find((u) => u.progress.percent < 100) ?? units[units.length - 1]!;

  return (
    <div className="stack" style={{ gap: '1.5rem' }}>
      <header className="stack" style={{ gap: '0.25rem' }}>
        <span className="eyebrow">Buch 1 · العربية بين يديك</span>
        <h1>Einheiten</h1>
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

      <ol className="unit-grid" aria-label="Alle Einheiten">
        {units.map(({ unit, title, progress }) => (
          <li key={unit.unit}>
            <Link
              to={`/units/${unit.unit}`}
              className={`unit-tile${unit.unit === current.unit.unit ? ' unit-tile-current' : ''}${progress.percent === 100 ? ' unit-tile-done' : ''}`}
              aria-label={`Einheit ${unit.unit}${title ? `, ${title}` : ''}, ${progress.percent} % erledigt`}
            >
              <span className="unit-tile-number arabic-display" aria-hidden>
                {arabicNumber(unit.unit)}
              </span>
              <span className="unit-tile-label">
                {progress.percent === 100 && (
                  <Icon name="check" size={16} strokeWidth={2.6} />
                )}
                Einheit {unit.unit}
              </span>
              <span className="unit-tile-bar" aria-hidden>
                <span style={{ width: `${progress.percent}%` }} />
              </span>
            </Link>
          </li>
        ))}
      </ol>
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
