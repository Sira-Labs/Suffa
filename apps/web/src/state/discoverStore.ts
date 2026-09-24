import { create } from 'zustand';
import type { DiscoverProgress } from '@/types';
import { discoverRepo } from '@/services/storage';

interface DiscoverState {
  /** By item id (`yt/${id}`). */
  progress: Record<string, DiscoverProgress>;
  loaded: boolean;
  load(): Promise<void>;
  /** The learner played an item: it is (re-)pinned to "Weiterschauen" on top. */
  open(id: string, now?: Date): Promise<void>;
  /** Pin by hand, or unpin (e.g. a started video the learner does not like). */
  setPinned(id: string, pinned: boolean, now?: Date): Promise<void>;
}

export const useDiscoverStore = create<DiscoverState>((set, get) => ({
  progress: {},
  loaded: false,

  async load() {
    const all = await discoverRepo.all();
    set({ progress: Object.fromEntries(all.map((p) => [p.id, p])), loaded: true });
  },

  async open(id, now = new Date()) {
    const at = now.toISOString();
    const existing = get().progress[id];
    await save({
      id,
      startedAt: existing?.startedAt ?? at,
      openedAt: at,
      pinned: true,
      updated_at: at,
      deleted: false,
    });
  },

  async setPinned(id, pinned, now = new Date()) {
    const at = now.toISOString();
    const existing = get().progress[id];
    await save({
      id,
      startedAt: existing?.startedAt ?? null,
      // Pinning by hand puts the item on top; unpinning keeps its place in history.
      openedAt: pinned ? at : (existing?.openedAt ?? at),
      pinned,
      updated_at: at,
      deleted: false,
    });
  },
}));

async function save(record: DiscoverProgress): Promise<void> {
  // Memory first, so the list reorders at once; then persist.
  useDiscoverStore.setState((s) => ({
    progress: { ...s.progress, [record.id]: record },
  }));
  await discoverRepo.put(record);
}
