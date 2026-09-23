import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, ScrollRestoration, useLocation } from 'react-router-dom';
import { CelebrationToast, SyncBadge } from './components';
import { Icon } from './components/Icon';
import { FOCUS_PATHS, isUnderMore, MORE_PATH, NAV_ITEMS } from './navigation';
import { logger } from './services/logger';
import {
  useContentStore,
  useListenStore,
  useSettingsStore,
  useSrsStore,
  useSyncStore,
} from './state';
import './styles/global.css';

/**
 * App shell: loads all local stores (offline-first) and initialises sync.
 * The UI is rendered only after loading.
 */
export function App() {
  const [ready, setReady] = useState(false);
  const loadSettings = useSettingsStore((s) => s.load);
  const loadContent = useContentStore((s) => s.load);
  const loadSrs = useSrsStore((s) => s.load);
  const initSync = useSyncStore((s) => s.init);
  const loadListening = useListenStore((s) => s.load);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Order: custom content before SRS (card seeding needs the user's vocabulary).
      await loadSettings();
      await loadContent();
      await loadSrs();
      await loadListening();
      initSync();
      if (!cancelled) setReady(true);
    })().catch((error) => {
      // Specific error message instead of a silent hang; `error` goes to error tracking.
      logger.error('App initialisation failed', {
        message: error instanceof Error ? error.message : String(error),
      });
      if (!cancelled) setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [loadSettings, loadContent, loadSrs, loadListening, initSync]);

  if (!ready) {
    return (
      <div className="app-shell" style={{ textAlign: 'center', paddingTop: '4rem' }}>
        <img src="/brand/suffa-mark.svg" alt="" width={96} height={96} />
        <p className="arabic-inline" style={{ fontSize: '2rem', margin: '0.5rem 0 0' }}>
          الصُّفَّة
        </p>
        <p className="muted">Lade Lernstand…</p>
      </div>
    );
  }

  return <Shell />;
}

function Brand() {
  return (
    <Link to="/" className="brand" aria-label="Suffa – zur Übersicht">
      <span className="brand-latin">Suffa</span>
      <span className="brand-arabic" lang="ar">
        الصُّفَّة
      </span>
    </Link>
  );
}

/** Layout: bottom bar on phones, sidebar on wide screens (one nav, restyled by CSS). */
function Shell() {
  const { pathname } = useLocation();
  const moreActive = isUnderMore(pathname);
  if (FOCUS_PATHS.includes(pathname)) {
    return (
      <main className="focus-main">
        <ScrollRestoration />
        <Outlet />
        <CelebrationToast />
      </main>
    );
  }
  return (
    <div className="app-shell">
      <nav className="app-nav" aria-label="Hauptnavigation">
        <div className="nav-brand">
          <Brand />
        </div>
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              `nav-link${item.tier === 'secondary' ? ' nav-link-secondary' : ''}${isActive ? ' nav-link-active' : ''}`
            }
          >
            <Icon name={item.icon} />
            <span className="nav-label">{item.label}</span>
          </NavLink>
        ))}
        <Link
          to={MORE_PATH}
          className={`nav-link nav-link-more${moreActive ? ' nav-link-active' : ''}`}
          aria-current={moreActive ? 'page' : undefined}
        >
          <Icon name="more" />
          <span className="nav-label">Mehr</span>
        </Link>
        <div className="nav-footer">
          <SyncBadge />
        </div>
      </nav>

      <div className="app-content">
        <header className="app-topbar">
          <Brand />
          <SyncBadge />
        </header>
        <main className="app-main">
          {/* New pages start at the top; back/forward restores the old position. */}
          <ScrollRestoration />
          <Outlet />
        </main>
        <CelebrationToast />
      </div>
    </div>
  );
}
