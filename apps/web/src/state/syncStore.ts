/**
 * Sync store: holds provider, auth state, sync status and pending count.
 * Triggers a sync on login, on reconnect, when the app returns to the foreground, every few
 * minutes and soon after local changes (autoSync.ts), and manually.
 */
import { create } from 'zustand';
import { startAutoSync } from '@/services/sync/autoSync';
import {
  createSyncProvider,
  SyncEngine,
  type AuthState,
  type SyncProvider,
} from '@/services/sync';
import { logger } from '@/services/logger';
import { useCheckInStore } from './checkInStore';
import { useDiscoverStore } from './discoverStore';
import { useEnrollmentStore } from './enrollmentStore';
import { useListenStore } from './listenStore';
import { usePracticeStore } from './practiceStore';
import { useSettingsStore } from './settingsStore';
import { useSrsStore } from './srsStore';

/** Everything a sync can change underneath the screen. */
async function reloadSyncedStores(): Promise<void> {
  await Promise.all([
    useSrsStore.getState().load(),
    usePracticeStore.getState().load(),
    useEnrollmentStore.getState().load(),
    useCheckInStore.getState().load(),
    useDiscoverStore.getState().load(),
    useListenStore.getState().load(),
    useSettingsStore.getState().load(),
  ]);
}

const log = logger.child('state:sync');

export type UiSyncStatus = 'idle' | 'syncing' | 'offline' | 'error' | 'disabled';

interface SyncState {
  provider: SyncProvider;
  engine: SyncEngine;
  auth: AuthState;
  status: UiSyncStatus;
  pending: number;
  lastSyncAt: string | null;
  errorMessage: string | null;
  init(): void;
  signIn(email: string): Promise<{ ok: boolean; message?: string }>;
  signOut(): Promise<void>;
  syncNow(): Promise<void>;
  refreshPending(): Promise<void>;
}

const provider = createSyncProvider();
const engine = new SyncEngine(provider);

export const useSyncStore = create<SyncState>((set, get) => ({
  provider,
  engine,
  auth: provider.getAuthState(),
  status: provider.isConfigured() ? 'idle' : 'disabled',
  pending: 0,
  lastSyncAt: null,
  errorMessage: null,

  init() {
    const p = get().provider;
    p.onAuthChange((auth) => {
      set({ auth });
      if (auth.status === 'signed-in') {
        void get().syncNow();
      }
    });

    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => void get().syncNow());
      window.addEventListener('offline', () => set({ status: 'offline' }));
      // Foreground, every few minutes and soon after local changes (see autoSync.ts).
      startAutoSync({
        sync: () => get().syncNow(),
        isSignedIn: () => get().auth.status === 'signed-in',
        pending: () => get().engine.pendingCount(),
      });
    }

    void get().refreshPending();
    void get()
      .engine.lastSyncAt()
      .then((lastSyncAt) => set({ lastSyncAt }));
  },

  async signIn(email) {
    const result = await get().provider.signInWithEmail(email);
    if (!result.ok) {
      set({ errorMessage: result.error.message });
      return { ok: false, message: result.error.message };
    }
    return { ok: true };
  },

  async signOut() {
    await get().provider.signOut();
    set({ auth: { status: 'signed-out' } });
  },

  async syncNow() {
    const { engine, provider: p } = get();
    if (!p.isConfigured()) {
      set({ status: 'disabled' });
      return;
    }
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      set({ status: 'offline' });
      return;
    }
    set({ status: 'syncing', errorMessage: null });
    try {
      const result = await engine.sync();
      // Data changed underneath the screen (other device, repair): show it right away.
      if (result.pulled > 0 || result.repaired > 0) await reloadSyncedStores();
      const lastSyncAt = await engine.lastSyncAt();
      await get().refreshPending();
      set({ status: 'idle', lastSyncAt });
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Sync fehlgeschlagen';
      log.error('Sync error', { message });
      set({ status: 'error', errorMessage: message });
    }
  },

  async refreshPending() {
    const pending = await get().engine.pendingCount();
    set({ pending });
  },
}));
