import { Link } from 'react-router-dom';
import { Icon } from '@/components/Icon';
import { NAV_ITEMS } from '@/navigation';

/** Mobile overflow page: every destination that does not fit into the bottom bar. */
export function More() {
  const items = NAV_ITEMS.filter((item) => item.tier === 'secondary');
  return (
    <div className="stack">
      <h1>Mehr</h1>
      <ul className="more-grid" aria-label="Weitere Bereiche">
        {items.map((item) => (
          <li key={item.to}>
            <Link to={item.to} className="more-tile">
              <span className="more-icon">
                <Icon name={item.icon} size={24} />
              </span>
              <span className="stack" style={{ gap: 2 }}>
                <strong>{item.label}</strong>
                <span className="muted" style={{ fontSize: '0.9rem' }}>
                  {item.description}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
