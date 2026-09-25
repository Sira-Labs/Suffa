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
  /**
   * al-Muʿallim can be used (signed in and a model configured): decides whether the tutor
   * quest can be picked. Remembered per device so offline days pick the same quests.
   */
  tutorAvailable: boolean;
  refresh(): Promise<void>;
  setServer(server: ServerEngagement | null): void;
  setTutorAvailable(available: boolean): void;
}

const TUTOR_KEY = 'suffa.tutorAvailable';

function storedTutorAvailable(): boolean {
  try {
    return localStorage.getItem(TUTOR_KEY) === '1';
  } catch {
    // Storage blocked (private mode): quests without the tutor.
    return false;
  }
}

export const useEngagementStore = create<EngagementState>((set) => ({
  logs: [],
  server: null,
  tutorAvailable: storedTutorAvailable(),

  setTutorAvailable(available) {
    try {
      localStorage.setItem(TUTOR_KEY, available ? '1' : '0');
    } catch {
      // Not remembered; the next start asks the server again.
    }
    set({ tutorAvailable: available });
  },

  async refresh() {
    set({ logs: await reviewLogRepo.all() });
  },

  setServer(server) {
    set({ server });
  },
}));
