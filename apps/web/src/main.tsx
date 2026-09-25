import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { registerSW } from 'virtual:pwa-register';
import { installNativeBridge, listenForAppLinks } from './native/install';
import { router } from './router';
import { initErrorTracking } from './services/errorTracking';
import { logger } from './services/logger';
import { ApiSyncProvider } from './services/sync/ApiSyncProvider';
import { useSyncStore } from './state';

const log = logger.child('pwa');

async function start(): Promise<void> {
  const rootEl = document.getElementById('root');
  if (!rootEl) {
    throw new Error('Root element #root not found.');
  }

  // In the app shell the bundle is on the device already: no service worker, but the
  // session token must be loaded before the first request (ADR-0019).
  const bridge = await installNativeBridge();
  if (bridge) {
    void listenForAppLinks({
      fetch: (...args) => fetch(...args),
      navigate: (path) => void router.navigate(path),
      signedIn: async () => {
        const { provider } = useSyncStore.getState();
        if (provider instanceof ApiSyncProvider) await provider.refresh();
      },
    });
  } else {
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
  }

  createRoot(rootEl).render(
    <StrictMode>
      <RouterProvider router={router} />
    </StrictMode>
  );

  // After the first render, so startup never waits for the network.
  void initErrorTracking();
}

void start();
