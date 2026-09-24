import { create } from 'zustand';
import type { ReviewLog } from '@/types';
import { reviewLogRepo } from '@/services/storage';
import { lessonSizes, loadPublisherIndex } from '@/services/audio/publisherIndex';
import { logger } from '@/services/logger';

/**
 * Inputs of the engagement rules that no other store keeps: all review logs and the size of
 * every lesson (for lesson bonuses). Reloaded whenever the cards change.
 */
interface EngagementState {
  logs: ReviewLog[];
  lessonSizes: ReadonlyMap<string, number>;
  refresh(): Promise<void>;
  loadLessonSizes(): Promise<void>;
}

export const useEngagementStore = create<EngagementState>((set) => ({
  logs: [],
  lessonSizes: new Map(),

  async refresh() {
    set({ logs: await reviewLogRepo.all() });
  },

  async loadLessonSizes() {
    try {
      set({ lessonSizes: lessonSizes(await loadPublisherIndex()) });
    } catch (error) {
      // Offline before the index was ever cached: lesson bonuses follow once it loads.
      if (!(error instanceof TypeError)) throw error;
      logger.info('Lesson sizes unavailable', { message: error.message });
    }
  },
}));
