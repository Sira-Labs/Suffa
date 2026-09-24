/**
 * The curated "Entdecken" catalog: lazy loading and pure helpers (level filter, weekly pick,
 * embed URLs). The catalog lives in content/sources/discover.json and is maintained by hand.
 */
import type {
  DiscoverCatalog,
  DiscoverCategory,
  DiscoverEntry,
  DiscoverItem,
} from '@/types';

let cached: Promise<DiscoverCatalog> | null = null;

export function loadDiscover(): Promise<DiscoverCatalog> {
  cached ??= import('@/content/sources/discover.json').then(
    (module) => module.default as DiscoverCatalog
  );
  return cached;
}

export const CATEGORY_LABELS: Record<DiscoverCategory, string> = {
  sprache: 'Sprache',
  quran: 'Quran',
  geschichten: 'Geschichten',
  podcasts: 'Podcasts',
};

/** "1-2" includes levels 1 and 2; "1" only level 1. */
export function levelIncludes(level: string, stufe: number): boolean {
  const [from, to] = level.split('-').map(Number);
  if (from === undefined || Number.isNaN(from)) return false;
  return stufe >= from && stufe <= (to ?? from);
}

export function entries(catalog: DiscoverCatalog): DiscoverEntry[] {
  return catalog.channels.flatMap((channel) =>
    channel.items.map((item) => ({ ...item, channel }))
  );
}

/** ISO week number, so the pick changes every Monday and is the same for everyone. */
export function isoWeek(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = Date.UTC(d.getUTCFullYear(), 0, 1);
  return Math.ceil(((d.getTime() - yearStart) / 86_400_000 + 1) / 7);
}

export function weeklyPick<T>(
  items: readonly T[],
  date: Date = new Date()
): T | undefined {
  if (items.length === 0) return undefined;
  return items[(isoWeek(date) + date.getFullYear()) % items.length];
}

/** Privacy-enhanced embed; a playlist plays as a series. */
export function discoverEmbedUrl(item: DiscoverItem): string {
  const id = encodeURIComponent(item.id);
  return item.type === 'playlist'
    ? `https://www.youtube-nocookie.com/embed/videoseries?list=${id}&rel=0&autoplay=1`
    : `https://www.youtube-nocookie.com/embed/${id}?rel=0&autoplay=1`;
}

export function discoverThumbnail(item: DiscoverItem): string | null {
  return item.type === 'video'
    ? `https://i.ytimg.com/vi/${encodeURIComponent(item.id)}/mqdefault.jpg`
    : null;
}

export function youtubeUrl(item: DiscoverItem): string {
  return item.type === 'playlist'
    ? `https://www.youtube.com/playlist?list=${encodeURIComponent(item.id)}`
    : `https://www.youtube.com/watch?v=${encodeURIComponent(item.id)}`;
}

/** Media progress id of a seen item. */
export function seenId(item: DiscoverItem): string {
  return `yt/${item.id}`;
}
