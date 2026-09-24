/**
 * The publisher's page videos by unit. Pure helpers plus a lazy loader, so the video index
 * (≈ 20 kB) is only fetched on pages that show videos.
 */
import type { BookPages, BookVideo, BookVideoIndex, UnitVideos } from '@/types';

export interface BookVideoData {
  index: BookVideoIndex;
  pages: BookPages;
}

let cached: Promise<BookVideoData> | null = null;

export function loadBookVideos(): Promise<BookVideoData> {
  cached ??= Promise.all([
    import('@/content/sources/book1-videos.json'),
    import('@/content/sources/book1-pages.json'),
  ]).then(([videos, pages]) => ({
    index: videos.default as BookVideoIndex,
    pages: pages.default as BookPages,
  }));
  return cached;
}

/** Book pages of a unit (up to the page before the next unit starts), or null if unknown. */
export function unitPageRange(
  pages: BookPages,
  unit: number
): { from: number; to: number } | null {
  const from = pages.unitStartPages[String(unit)];
  if (from === undefined) return null;
  const next = pages.unitStartPages[String(unit + 1)];
  return { from, to: next !== undefined ? next - 1 : pages.lastPage };
}

export function videosForUnit(data: BookVideoData, unit: number): UnitVideos | null {
  const range = unitPageRange(data.pages, unit);
  if (!range) return null;
  return {
    unit,
    ...range,
    estimated: data.pages.status !== 'verified',
    videos: data.index.videos.filter((v) => v.page >= range.from && v.page <= range.to),
  };
}

/** Privacy-enhanced embed: YouTube sets no cookies until the learner presses play. */
export function embedUrl(video: BookVideo, autoplay = false): string {
  return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(video.id)}?rel=0${autoplay ? '&autoplay=1' : ''}`;
}

export function thumbnailUrl(video: BookVideo): string {
  return `https://i.ytimg.com/vi/${encodeURIComponent(video.id)}/mqdefault.jpg`;
}

/** "S. 32" or "S. ~32" for a page placed between neighbours. */
export function pageLabel(video: BookVideo): string {
  return `S. ${video.approx ? '~' : ''}${video.page}`;
}
