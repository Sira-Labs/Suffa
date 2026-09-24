import { create } from 'zustand';
import type { ReviewLog } from '@/types';
import { reviewLogRepo } from '@/services/storage';
import type { ServerEngagement } from '@/services/sync/ApiSyncProvider';

/**
 * Engagement inputs no other store keeps: all review logs (reloaded whenever the cards
 * change), and the server's copy of the results after the last sync (story 5.4).
 */
interface EngagementState {
  logs: ReviewLog[];
  server: ServerEngagement | null;
  refresh(): Promise<void>;
  setServer(server: ServerEngagement | null): void;
}

export const useEngagementStore = create<EngagementState>((set) => ({
  logs: [],
  server: null,

  async refresh() {
    set({ logs: await reviewLogRepo.all() });
  },

  setServer(server) {
    set({ server });
  },
}));
