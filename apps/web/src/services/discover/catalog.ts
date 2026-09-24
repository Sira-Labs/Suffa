/**
 * The curated "Entdecken" catalog: lazy loading and pure helpers (level filter, weekly pick,
 * embed URLs). The catalog lives in content/sources/discover.json and is maintained by hand.
 */
import type {
  DiscoverCatalog,
  DiscoverCategory,
  DiscoverEntry,
  DiscoverItem,
  DiscoverProgress,
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

/** Where to continue: seconds into the video and, for a playlist, which video (0-based). */
export interface ResumeAt {
  positionSec?: number;
  playlistIndex?: number;
}

/**
 * Privacy-enhanced embed; a playlist plays as a series. `enablejsapi` lets the page read the
 * position (to continue later); `resume` starts where the learner stopped.
 */
export function discoverEmbedUrl(item: DiscoverItem, resume: ResumeAt = {}): string {
  const id = encodeURIComponent(item.id);
  const base =
    item.type === 'playlist'
      ? `https://www.youtube-nocookie.com/embed/videoseries?list=${id}`
      : `https://www.youtube-nocookie.com/embed/${id}?`;
  const params = [`rel=0`, `autoplay=1`, `enablejsapi=1`];
  if (item.type === 'playlist' && resume.playlistIndex) {
    params.push(`index=${resume.playlistIndex}`);
  }
  const start = Math.floor(resume.positionSec ?? 0);
  if (start > 0) params.push(`start=${start}`);
  return `${base}${item.type === 'playlist' ? '&' : ''}${params.join('&')}`;
}

/** "4:05" or "1:02:03". */
export function formatPosition(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const rest = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${rest}` : `${m}:${rest}`;
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

/**
 * "Weiterschauen": pinned items not seen yet, most recently opened first. Items the catalog no
 * longer lists drop out.
 */
export function pinnedEntries<T extends DiscoverItem>(
  items: readonly T[],
  progress: Readonly<Record<string, DiscoverProgress>>,
  isSeen: (item: T) => boolean
): T[] {
  return items
    .filter((item) => progress[seenId(item)]?.pinned && !isSeen(item))
    .sort((a, b) =>
      progress[seenId(b)]!.openedAt.localeCompare(progress[seenId(a)]!.openedAt)
    );
}

/** Share of the current video watched (0–100), or null without a known length. */
export function watchedPercent(
  progress: Pick<DiscoverProgress, 'positionSec' | 'durationSec'> | undefined
): number | null {
  if (!progress?.durationSec || progress.positionSec === undefined) return null;
  return Math.min(100, Math.round((progress.positionSec / progress.durationSec) * 100));
}
