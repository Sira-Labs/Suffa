/**
 * Sync-Store: hält Provider, Auth-Zustand, Sync-Status und Pending-Count.
 * Triggert Sync bei Login, manuell und bei Wiederverbindung (online-Event).
 */
import { create } from 'zustand';
import {
  createSyncProvider,
  SyncEngine,
  type AuthState,
  type SyncProvider,
} from '@/services/sync';
import { logger } from '@/services/logger';

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
      await engine.sync();
      const lastSyncAt = await engine.lastSyncAt();
      await get().refreshPending();
      set({ status: 'idle', lastSyncAt });
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Sync fehlgeschlagen';
      log.error('Sync-Fehler', { message });
      set({ status: 'error', errorMessage: message });
    }
  },

  async refreshPending() {
    const pending = await get().engine.pendingCount();
    set({ pending });
  },
}));
