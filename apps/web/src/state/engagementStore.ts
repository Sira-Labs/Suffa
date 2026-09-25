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
  /** The video lesson catalog has lessons (the video quest can be picked). */
  videosAvailable: boolean;
  refresh(): Promise<void>;
  setServer(server: ServerEngagement | null): void;
  setTutorAvailable(available: boolean): void;
  setVideosAvailable(available: boolean): void;
}

const TUTOR_KEY = 'suffa.tutorAvailable';
const VIDEOS_KEY = 'suffa.videosAvailable';

function stored(key: string): boolean {
  try {
    return localStorage.getItem(key) === '1';
  } catch {
    // Storage blocked (private mode): quests without the feature.
    return false;
  }
}

function remember(key: string, value: boolean) {
  try {
    localStorage.setItem(key, value ? '1' : '0');
  } catch {
    // Not remembered; the next start asks the server again.
  }
}

export const useEngagementStore = create<EngagementState>((set) => ({
  logs: [],
  server: null,
  tutorAvailable: stored(TUTOR_KEY),
  videosAvailable: stored(VIDEOS_KEY),

  setTutorAvailable(available) {
    remember(TUTOR_KEY, available);
    set({ tutorAvailable: available });
  },

  setVideosAvailable(available) {
    remember(VIDEOS_KEY, available);
    set({ videosAvailable: available });
  },

  async refresh() {
    set({ logs: await reviewLogRepo.all() });
  },

  setServer(server) {
    set({ server });
  },
}));
