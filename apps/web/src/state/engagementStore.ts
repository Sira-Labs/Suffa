import { create } from 'zustand';
import { isCourseId, type CourseId } from '@suffa/engagement';
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
  /**
   * Courses with video lessons in the catalog: the video quest only comes up for learners of
   * these. Null until the catalog was asked once on this device.
   */
  videoCourses: CourseId[] | null;
  refresh(): Promise<void>;
  setServer(server: ServerEngagement | null): void;
  setTutorAvailable(available: boolean): void;
  setVideosAvailable(available: boolean, courses?: readonly CourseId[]): void;
}

const TUTOR_KEY = 'suffa.tutorAvailable';
const VIDEOS_KEY = 'suffa.videosAvailable';
const VIDEO_COURSES_KEY = 'suffa.videoCourses';

function stored(key: string): boolean {
  try {
    return localStorage.getItem(key) === '1';
  } catch {
    // Storage blocked (private mode): quests without the feature.
    return false;
  }
}

function remember(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Not remembered; the next start asks the server again.
  }
}

function storedCourses(): CourseId[] | null {
  try {
    const raw = localStorage.getItem(VIDEO_COURSES_KEY);
    if (raw === null) return null;
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isCourseId) : null;
  } catch {
    // Blocked storage or a damaged value: unknown, as on a new device.
    return null;
  }
}

export const useEngagementStore = create<EngagementState>((set) => ({
  logs: [],
  server: null,
  tutorAvailable: stored(TUTOR_KEY),
  videosAvailable: stored(VIDEOS_KEY),
  videoCourses: storedCourses(),

  setTutorAvailable(available) {
    remember(TUTOR_KEY, available ? '1' : '0');
    set({ tutorAvailable: available });
  },

  setVideosAvailable(available, courses) {
    remember(VIDEOS_KEY, available ? '1' : '0');
    const videoCourses = courses ? [...new Set(courses)] : null;
    if (videoCourses) remember(VIDEO_COURSES_KEY, JSON.stringify(videoCourses));
    set({ videosAvailable: available, videoCourses });
  },

  async refresh() {
    set({ logs: await reviewLogRepo.all() });
  },

  setServer(server) {
    set({ server });
  },
}));
