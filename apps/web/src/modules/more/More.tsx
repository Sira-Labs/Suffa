import { Link } from 'react-router-dom';
import { Icon } from '@/components/Icon';
import { NAV_ITEMS, type NavItem } from '@/navigation';
import { ApiSyncProvider } from '@/services/sync/ApiSyncProvider';
import { useSyncStore } from '@/state';

/** Admins also see the admin area (story 4.2). */
const ADMIN_ITEM: NavItem = {
  to: '/admin',
  label: 'Verwaltung',
  description: 'Nutzer, Rollen und Protokoll',
  icon: 'lock',
  tier: 'secondary',
};

/** Mobile overflow page: every destination that does not fit into the bottom bar. */
export function More() {
  const provider = useSyncStore((s) => s.provider);
  useSyncStore((s) => s.auth); // re-render when the signed-in user changes
  const isAdmin =
    provider instanceof ApiSyncProvider && provider.currentUser()?.role === 'admin';
  const items = NAV_ITEMS.filter((item) => item.tier === 'secondary');
  return (
    <HubPage
      title="Mehr"
      listLabel="Weitere Bereiche"
      items={isAdmin ? [...items, ADMIN_ITEM] : items}
    />
  );
}

/** "Training": practice across the units reached so far (the unit room covers one at a time). */
export function Training() {
  return (
    <HubPage
      title="Training"
      intro="Üben mit allem aus den Einheiten, die du schon erreicht hast – neue Einheiten kommen mit jedem bestandenen Test dazu."
      listLabel="Trainingsbereiche"
      items={NAV_ITEMS.filter((item) => item.tier === 'training')}
    />
  );
}

function HubPage({
  title,
  intro,
  listLabel,
  items,
}: {
  title: string;
  intro?: string;
  listLabel: string;
  items: NavItem[];
}) {
  return (
    <div className="stack">
      <h1>{title}</h1>
      {intro && (
        <p className="muted" style={{ margin: 0 }}>
          {intro}
        </p>
      )}
      <ul className="more-grid" aria-label={listLabel}>
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
