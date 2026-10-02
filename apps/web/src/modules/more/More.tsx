import { Link } from 'react-router-dom';
import { Icon } from '@/components/Icon';
import { MORE_GROUP_LABEL, NAV_ITEMS, type MoreGroup, type NavItem } from '@/navigation';
import { useRole } from '@/modules/account/useRole';

/** Admins also see the admin area (story 4.2). */
const ADMIN_ITEM: NavItem = {
  to: '/admin',
  label: 'Verwaltung',
  description: 'Nutzer, Rollen und Protokoll',
  icon: 'lock',
  tier: 'secondary',
  group: 'me',
};

const GROUPS: readonly MoreGroup[] = ['media', 'help', 'me'];

/** Mobile overflow page: media, help and the learner's own pages, in three groups. */
export function More() {
  const isAdmin = useRole() === 'admin';
  const items = NAV_ITEMS.filter((item) => item.tier === 'secondary');
  const all = isAdmin ? [...items, ADMIN_ITEM] : items;
  return (
    <div className="stack" style={{ gap: '1.25rem' }}>
      <h1>Mehr</h1>
      {GROUPS.map((group) => (
        <section key={group} className="stack" aria-labelledby={`more-${group}`}>
          <h2 id={`more-${group}`} className="eyebrow">
            {MORE_GROUP_LABEL[group]}
          </h2>
          <TileList
            label={MORE_GROUP_LABEL[group]}
            items={all.filter((item) => item.group === group)}
          />
        </section>
      ))}
    </div>
  );
}

/** "Üben": practice across the units reached so far (the unit room covers one at a time). */
export function Training() {
  return (
    <div className="stack">
      <h1>Üben</h1>
      <p className="muted" style={{ margin: 0 }}>
        Üben mit allem aus den Einheiten, die du schon erreicht hast – neue Einheiten
        kommen mit jedem bestandenen Test dazu.
      </p>
      <TileList
        label="Trainingsbereiche"
        items={NAV_ITEMS.filter((item) => item.tier === 'training')}
      />
    </div>
  );
}

function TileList({ label, items }: { label: string; items: readonly NavItem[] }) {
  return (
    <ul className="more-grid" aria-label={label}>
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
  );
}
