import type { Syncable } from './srs';

/**
 * Listening progress per audio track (ADR-0018 `media_progress`). Local for now; it joins
 * sync once the server has the table (engagement sprint, ADR-0016). XP is derived from these
 * records, never stored.
 */
export interface MediaProgress extends Syncable {
  /** Stable track id, e.g. "b1/unit01/lesson01/01" (see trackId()). */
  id: string;
  /** Publisher audio track, a video marked as seen in "Entdecken", or a class recording. */
  source: 'publisher-audio' | 'discover-video' | 'recording';
  /** Audio URL. */
  ref: string;
  /** Lesson key the track belongs to, e.g. "b1/u1/l1" (for lesson bonuses). */
  lessonKey: string;
  durationSec: number;
  /** Seconds actually played (seeking does not count), capped at the duration. */
  listenedSec: number;
  /** ISO time the track counted as heard, or null. */
  completedAt: string | null;
}
