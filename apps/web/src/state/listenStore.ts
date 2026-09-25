import { create } from 'zustand';
import type { MediaProgress } from '@/types';
import { mediaProgressRepo } from '@/services/storage';
import { HEARD_THRESHOLD, XP_RULES } from '@/services/engagement/xp';

export interface TrackRef {
  id: string;
  url: string;
  lessonKey: string;
  /** Number of tracks in the lesson (for the lesson bonus). */
  lessonSize: number;
  /** Publisher audio unless stated (class recordings, Sprint 7). */
  source?: MediaProgress['source'];
}

export interface ListenOutcome {
  /** The track just crossed the "heard" threshold. */
  trackHeard: boolean;
  /** That made every track of the lesson heard. */
  lessonComplete: boolean;
  xp: number;
}

interface ListenState {
  progress: Record<string, MediaProgress>;
  loaded: boolean;
  load(): Promise<void>;
  /** Adds actually played seconds of a track; detects "heard" and lesson completion. */
  record(track: TrackRef, playedSec: number, durationSec: number): Promise<ListenOutcome>;
  /**
   * Marks a curated video as seen ("Entdecken"). Embedded YouTube playback cannot be measured
   * without YouTube's tracking API, so the learner confirms it. Returns false if already seen.
   */
  markSeen(id: string, url: string): Promise<boolean>;
}

const NOTHING: ListenOutcome = { trackHeard: false, lessonComplete: false, xp: 0 };

export const useListenStore = create<ListenState>((set, get) => ({
  progress: {},
  loaded: false,

  async load() {
    const all = await mediaProgressRepo.all();
    set({ progress: Object.fromEntries(all.map((p) => [p.id, p])), loaded: true });
  },

  async markSeen(id, url) {
    if (get().progress[id]?.completedAt) return false;
    const now = new Date().toISOString();
    const next: MediaProgress = {
      id,
      source: 'discover-video',
      ref: url,
      lessonKey: 'discover',
      durationSec: 0,
      listenedSec: 0,
      completedAt: now,
      updated_at: now,
      deleted: false,
    };
    set({ progress: { ...get().progress, [id]: next } });
    await mediaProgressRepo.put(next);
    return true;
  },

  async record(track, playedSec, durationSec) {
    if (!(playedSec > 0) || !Number.isFinite(durationSec) || durationSec <= 0)
      return NOTHING;
    const existing = get().progress[track.id];
    const duration = Math.max(durationSec, existing?.durationSec ?? 0);
    const listened = Math.min(duration, (existing?.listenedSec ?? 0) + playedSec);
    const justHeard = !existing?.completedAt && listened / duration >= HEARD_THRESHOLD;
    const next: MediaProgress = {
      id: track.id,
      source: track.source ?? 'publisher-audio',
      ref: track.url,
      lessonKey: track.lessonKey,
      durationSec: duration,
      listenedSec: listened,
      completedAt: existing?.completedAt ?? (justHeard ? new Date().toISOString() : null),
      updated_at: new Date().toISOString(),
      deleted: false,
    };
    // Update memory first, synchronously: two flushes in quick succession (e.g. the 5 s save
    // and a pause) must build on each other instead of both reading the old value.
    const progress = { ...get().progress, [next.id]: next };
    set({ progress });
    await mediaProgressRepo.put(next);
    if (!justHeard) return NOTHING;

    const heardInLesson = Object.values(progress).filter(
      (p) => p.lessonKey === track.lessonKey && p.completedAt
    ).length;
    const lessonComplete = heardInLesson >= track.lessonSize;
    return {
      trackHeard: true,
      lessonComplete,
      xp: XP_RULES.trackHeard + (lessonComplete ? XP_RULES.lessonComplete : 0),
    };
  },
}));
