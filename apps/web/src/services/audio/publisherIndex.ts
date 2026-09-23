/**
 * Helpers around the publisher audio index (content/sources/book1-audio.json): stable ids for
 * tracks and lessons, and lesson sizes for the lesson bonus. The index is loaded on demand.
 */
import type { AudioLesson, AudioUnit, PublisherAudioIndex } from '@/types';

let cached: Promise<PublisherAudioIndex> | null = null;

export function loadPublisherIndex(): Promise<PublisherAudioIndex> {
  cached ??= import('@/content/sources/book1-audio.json').then(
    (module) => module.default as PublisherAudioIndex
  );
  return cached;
}

/** "https://…/1st_Audio_Book/unit01/lesson01/01.mp3" → "b1/unit01/lesson01/01". */
export function trackId(book: number, url: string): string {
  const path = url.replace(/^.*_Audio_Book\//, '').replace(/\.mp3$/i, '');
  return `b${book}/${path}`;
}

export function lessonKey(book: number, unit: AudioUnit, lesson: AudioLesson): string {
  return `b${book}/u${unit.unit}/l${lesson.lesson}`;
}

/** lessonKey → number of tracks. */
export function lessonSizes(index: PublisherAudioIndex): Map<string, number> {
  const sizes = new Map<string, number>();
  for (const unit of index.units) {
    for (const lesson of unit.lessons) {
      sizes.set(lessonKey(index.book, unit, lesson), lesson.tracks.length);
    }
  }
  return sizes;
}
