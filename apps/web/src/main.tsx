import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { registerSW } from 'virtual:pwa-register';
import { router } from './router';
import { initErrorTracking } from './services/errorTracking';
import { logger } from './services/logger';

const log = logger.child('pwa');

// Register the service worker (offline-first). Auto-update on a new version.
registerSW({
  immediate: true,
  onOfflineReady() {
    log.info('App is ready for offline use');
  },
  onNeedRefresh() {
    log.info('New version available – active on next launch');
  },
});

const rootEl = document.getElementById('root');
if (!rootEl) {
  throw new Error('Root element #root not found.');
}

createRoot(rootEl).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>
);

// After the first render, so startup never waits for the network.
void initErrorTracking();
