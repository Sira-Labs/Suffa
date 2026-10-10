import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Link,
  Navigate,
  NavLink,
  Outlet,
  ScrollRestoration,
  useLocation,
} from 'react-router-dom';
import { CelebrationToast, SyncBadge } from './components';
import { Icon } from './components/Icon';
import {
  CLASSES_PATH,
  isFocusPath,
  isUnderClasses,
  isUnderMore,
  isUnderTraining,
  MORE_PATH,
  navItemsFor,
  navText,
  TRAINING_PATH,
} from './navigation';
import { setUiLanguage } from './i18n';
import { useRole } from './modules/account/useRole';
import { logger } from './services/logger';
import { useTrainingScope } from './modules/units/useReachedUnits';
import { EngagementWatcher } from './modules/engagement/EngagementWatcher';
import { useSignInGate } from './modules/account';
import {
  useCheckInStore,
  useContentStore,
  useDiscoverStore,
  useListenStore,
  usePracticeStore,
  useEnrollmentStore,
  useSettingsStore,
  useSrsStore,
  useSyncStore,
} from './state';
import './styles/global.css';
import { FeedbackButton } from '@/modules/feedback/FeedbackButton';

/**
 * App shell: loads all local stores (offline-first) and initialises sync.
 * The UI is rendered only after loading.
 */
export function App() {
  const { t } = useTranslation();
  const [ready, setReady] = useState(false);
  // The synced interface language (story 16.3): set here, on another device or by sync.
  const uiLanguage = useSettingsStore((s) => s.settings.uiLanguage);
  useEffect(() => {
    if (uiLanguage) void setUiLanguage(uiLanguage);
  }, [uiLanguage]);
  const loadSettings = useSettingsStore((s) => s.load);
  const loadContent = useContentStore((s) => s.load);
  const loadSrs = useSrsStore((s) => s.load);
  const initSync = useSyncStore((s) => s.init);
  const loadListening = useListenStore((s) => s.load);
  const loadPractice = usePracticeStore((s) => s.load);
  const loadEnrollments = useEnrollmentStore((s) => s.load);
  const loadCheckIns = useCheckInStore((s) => s.load);
  const loadDiscover = useDiscoverStore((s) => s.load);
  // New cards and training content come only from the units the learner reached.
  useTrainingScope();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Order: custom content before SRS (card seeding needs the user's vocabulary).
      await loadSettings();
      await loadContent();
      await loadSrs();
      await loadListening();
      await loadPractice();
      await loadEnrollments();
      await loadCheckIns();
      await loadDiscover();
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
  }, [
    loadSettings,
    loadContent,
    loadSrs,
    loadListening,
    loadPractice,
    loadEnrollments,
    loadCheckIns,
    loadDiscover,
    initSync,
  ]);

  if (!ready) {
    return (
      <div className="app-shell" style={{ textAlign: 'center', paddingTop: '4rem' }}>
        <img src="/brand/suffa-mark.svg" alt="" width={96} height={96} />
        <p className="arabic-inline" style={{ fontSize: '2rem', margin: '0.5rem 0 0' }}>
          الصُّفَّة
        </p>
        <p className="muted">{t('loadingProgress')}</p>
      </div>
    );
  }

  return (
    <>
      <EngagementWatcher />
      <Shell />
    </>
  );
}

function Brand() {
  const { t } = useTranslation();
  return (
    <Link to="/" className="brand" aria-label={t('toOverview')}>
      <img
        className="brand-mark"
        src="/brand/suffa-mark.svg"
        alt=""
        width={32}
        height={32}
      />
      <span className="brand-latin" translate="no">
        Suffa
      </span>
      <span className="brand-arabic" lang="ar">
        الصُّفَّة
      </span>
    </Link>
  );
}

/** Layout: bottom bar on phones, sidebar on wide screens (one nav, restyled by CSS). */
function Shell() {
  const { t } = useTranslation(['common', 'nav']);
  const { pathname } = useLocation();
  const moreActive = isUnderMore(pathname);
  const items = navItemsFor(useRole());
  // Not signed in: the sign-in page comes first (it also offers "ohne Konto weiter").
  const signInFirst = useSignInGate();
  if (signInFirst) return <Navigate to={signInFirst} replace />;
  if (isFocusPath(pathname)) {
    return (
      <main className="focus-main">
        <ScrollRestoration />
        <Outlet />
        <CelebrationToast />
        <FeedbackButton />
      </main>
    );
  }
  return (
    <div className="app-shell">
      <nav className="app-nav" aria-label={t('nav:main')}>
        <div className="nav-brand">
          <Brand />
        </div>
        {items.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) => {
              // "Üben" and "Klasse" stay lit on every page below them (phone bar).
              const active =
                isActive ||
                (item.to === TRAINING_PATH && isUnderTraining(pathname)) ||
                (item.to === CLASSES_PATH && isUnderClasses(pathname));
              return `nav-link${item.tier !== 'primary' ? ' nav-link-secondary' : ''}${active ? ' nav-link-active' : ''}`;
            }}
          >
            <Icon name={item.icon} />
            <span className="nav-label">{navText(item).label}</span>
          </NavLink>
        ))}
        <Link
          to={MORE_PATH}
          className={`nav-link nav-link-more${moreActive ? ' nav-link-active' : ''}`}
          aria-current={moreActive ? 'page' : undefined}
        >
          <Icon name="more" />
          <span className="nav-label">{t('nav:more')}</span>
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
        <FeedbackButton />
      </div>
    </div>
  );
}
