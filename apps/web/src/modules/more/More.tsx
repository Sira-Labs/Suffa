import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Icon } from '@/components/Icon';
import { NAV_ITEMS, navText, type MoreGroup, type NavItem } from '@/navigation';
import { useRole } from '@/modules/account/useRole';

/** Admins also see the admin area (story 4.2). */
const ADMIN_ITEM: NavItem = {
  to: '/admin',
  id: 'admin',
  icon: 'lock',
  tier: 'secondary',
  group: 'me',
};

/** Teachers and admins check the course content (story 16.1). */
const CONTENT_ITEM: NavItem = {
  to: '/inhalte',
  id: 'content',
  icon: 'read',
  tier: 'secondary',
  group: 'me',
};

const GROUPS: readonly MoreGroup[] = ['media', 'help', 'me'];

/** Mobile overflow page: media, help and the learner's own pages, in three groups. */
export function More() {
  const { t } = useTranslation('nav');
  const role = useRole();
  const items = NAV_ITEMS.filter((item) => item.tier === 'secondary');
  const all = [
    ...items,
    ...(role === 'teacher' || role === 'admin' ? [CONTENT_ITEM] : []),
    ...(role === 'admin' ? [ADMIN_ITEM] : []),
  ];
  return (
    <div className="stack" style={{ gap: '1.25rem' }}>
      <h1>{t('more')}</h1>
      {GROUPS.map((group) => (
        <section key={group} className="stack" aria-labelledby={`more-${group}`}>
          <h2 id={`more-${group}`} className="eyebrow">
            {t(`groups.${group}`)}
          </h2>
          <TileList
            label={t(`groups.${group}`)}
            items={all.filter((item) => item.group === group)}
          />
        </section>
      ))}
    </div>
  );
}

/** "Üben": practice across the units reached so far (the unit room covers one at a time). */
export function Training() {
  const { t } = useTranslation('nav');
  return (
    <div className="stack">
      <h1>{t('training')}</h1>
      <p className="muted" style={{ margin: 0 }}>
        {t('trainingIntro')}
      </p>
      <TileList
        label={t('trainingAreas')}
        items={NAV_ITEMS.filter((item) => item.tier === 'training')}
      />
    </div>
  );
}

function TileList({ label, items }: { label: string; items: readonly NavItem[] }) {
  // Re-renders when the language changes.
  useTranslation('nav');
  return (
    <ul className="more-grid" aria-label={label}>
      {items.map((item) => (
        <li key={item.to}>
          <Link to={item.to} className="more-tile">
            <span className="more-icon">
              <Icon name={item.icon} size={24} />
            </span>
            <span className="stack" style={{ gap: 2 }}>
              <strong>{navText(item).label}</strong>
              <span className="muted" style={{ fontSize: '0.9rem' }}>
                {navText(item).description}
              </span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
