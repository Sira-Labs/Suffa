import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { registerSW } from 'virtual:pwa-register';
import { router } from './router';
import { logger } from './services/logger';

const log = logger.child('pwa');

// Service Worker registrieren (offline-first). Auto-Update bei neuer Version.
registerSW({
  immediate: true,
  onOfflineReady() {
    log.info('App ist offline einsatzbereit');
  },
  onNeedRefresh() {
    log.info('Neue Version verfügbar – beim nächsten Start aktiv');
  },
});

const rootEl = document.getElementById('root');
if (!rootEl) {
  throw new Error('Root-Element #root nicht gefunden.');
}

createRoot(rootEl).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>
);
