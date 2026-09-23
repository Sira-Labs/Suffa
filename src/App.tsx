import { useEffect, useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { SyncBadge } from './components';
import { useContentStore, useSettingsStore, useSrsStore, useSyncStore } from './state';
import './styles/global.css';

const NAV = [
  { to: '/', label: 'Übersicht', icon: '📊', end: true },
  { to: '/vocab', label: 'Vokabeln', icon: '🗂️' },
  { to: '/roots', label: 'Wurzeln', icon: '🌳' },
  { to: '/reading', label: 'Lesen', icon: '📖' },
  { to: '/writing', label: 'Schreiben', icon: '✍️' },
  { to: '/speaking', label: 'Sprechen', icon: '🎤' },
  { to: '/conjugation', label: 'Konjugation', icon: '🔄' },
  { to: '/exam', label: 'Prüfung', icon: '🎯' },
  { to: '/library', label: 'Quellen', icon: '🎬' },
  { to: '/settings', label: 'Einstellungen', icon: '⚙️' },
];

/**
 * App-Shell: lädt alle lokalen Stores (offline-first) und initialisiert den Sync.
 * Erst nach dem Laden wird die Oberfläche gerendert.
 */
export function App() {
  const [ready, setReady] = useState(false);
  const loadSettings = useSettingsStore((s) => s.load);
  const loadContent = useContentStore((s) => s.load);
  const loadSrs = useSrsStore((s) => s.load);
  const initSync = useSyncStore((s) => s.init);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Reihenfolge: eigene Inhalte vor SRS (Karten-Seeding braucht User-Vokabeln).
      await loadSettings();
      await loadContent();
      await loadSrs();
      initSync();
      if (!cancelled) setReady(true);
    })().catch((error) => {
      // Spezifische Fehlermeldung statt stiller Blockade.
      console.error('App-Initialisierung fehlgeschlagen', error);
      if (!cancelled) setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [loadSettings, loadContent, loadSrs, initSync]);

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

  return (
    <div className="app-shell">
      <header
        className="row"
        style={{ justifyContent: 'space-between', marginBottom: '1rem' }}
      >
        <span className="row" style={{ gap: '0.5rem', alignItems: 'center' }}>
          <img src="/brand/suffa-mark.svg" alt="" width={32} height={32} />
          <strong style={{ fontSize: '1.2rem' }}>Suffa</strong>
          <span className="arabic-inline muted" style={{ fontSize: '1.1rem' }}>
            الصُّفَّة
          </span>
        </span>
        <SyncBadge />
      </header>

      <main>
        <Outlet />
      </main>

      <nav className="app-nav" aria-label="Hauptnavigation">
        {NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) => `nav-link${isActive ? ' nav-link-active' : ''}`}
          >
            <span aria-hidden style={{ fontSize: '1.2rem' }}>
              {item.icon}
            </span>
            <span className="nav-label">{item.label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
