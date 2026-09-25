/**
 * YouTube Data API v3 (ADR-0012): the videos of a playlist with title, duration and thumbnail.
 * Two calls per 50 videos (playlistItems.list, videos.list): 2 quota units, far below the
 * 10,000 a day.
 */
const API = 'https://www.googleapis.com/youtube/v3';

export interface YouTubeVideo {
  youtubeId: string;
  title: string;
  durationSec: number | null;
  thumbnailUrl: string | null;
  publishedAt: string | null;
  playlistId: string;
  position: number;
}

export class YouTubeError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message);
    this.name = 'YouTubeError';
  }
}

/** ISO 8601 duration (PT1H2M3S) in seconds; null for live or unknown. */
export function parseDuration(iso: string | undefined): number | null {
  const m = /^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso ?? '');
  if (!m || iso === 'P0D') return null;
  const [, d, h, min, s] = m.map((x) => Number(x ?? 0));
  return d! * 86_400 + h! * 3600 + min! * 60 + s!;
}

interface Thumbnails {
  [size: string]: { url: string } | undefined;
}

export class YouTubeClient {
  constructor(
    private readonly apiKey: string,
    private readonly fetchImpl: typeof fetch = fetch
  ) {}

  private async get<T>(path: string, params: Record<string, string>): Promise<T> {
    const url = new URL(`${API}/${path}`);
    for (const [k, v] of Object.entries({ ...params, key: this.apiKey })) {
      url.searchParams.set(k, v);
    }
    const response = await this.fetchImpl(url, { signal: AbortSignal.timeout(20_000) });
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      throw new YouTubeError(
        response.status,
        body?.error?.message?.slice(0, 200) ?? `YouTube answered ${response.status}`
      );
    }
    return (await response.json()) as T;
  }

  /** All public videos of a playlist, in playlist order (private and deleted ones skipped). */
  async playlist(playlistId: string, limit = 500): Promise<YouTubeVideo[]> {
    const items: { youtubeId: string; position: number }[] = [];
    let pageToken: string | undefined;
    do {
      const page = await this.get<{
        nextPageToken?: string;
        items: { contentDetails: { videoId: string }; snippet: { position: number } }[];
      }>('playlistItems', {
        part: 'contentDetails,snippet',
        playlistId,
        maxResults: '50',
        ...(pageToken ? { pageToken } : {}),
      });
      items.push(
        ...page.items.map((i) => ({
          youtubeId: i.contentDetails.videoId,
          position: i.snippet.position,
        }))
      );
      pageToken = page.nextPageToken;
    } while (pageToken && items.length < limit);

    const videos: YouTubeVideo[] = [];
    for (let i = 0; i < items.length; i += 50) {
      const batch = items.slice(i, i + 50);
      const details = await this.get<{
        items: {
          id: string;
          snippet: { title: string; publishedAt?: string; thumbnails?: Thumbnails };
          contentDetails: { duration?: string };
          status?: { privacyStatus?: string; embeddable?: boolean };
        }[];
      }>('videos', {
        part: 'snippet,contentDetails,status',
        id: batch.map((b) => b.youtubeId).join(','),
      });
      const byId = new Map(details.items.map((d) => [d.id, d]));
      for (const b of batch) {
        const d = byId.get(b.youtubeId);
        // Private, deleted or not embeddable videos cannot be shown in the app.
        if (
          !d ||
          d.status?.embeddable === false ||
          d.status?.privacyStatus === 'private'
        ) {
          continue;
        }
        const thumbs = d.snippet.thumbnails ?? {};
        videos.push({
          youtubeId: b.youtubeId,
          title: d.snippet.title.slice(0, 300),
          durationSec: parseDuration(d.contentDetails.duration),
          thumbnailUrl: (thumbs.medium ?? thumbs.high ?? thumbs.default)?.url ?? null,
          publishedAt: d.snippet.publishedAt ?? null,
          playlistId,
          position: b.position,
        });
      }
    }
    return videos;
  }
}

const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';

/**
 * A unit number from a lesson title ("الدرس ٥", "Lesson 5", "Einheit 12"), or null. Only
 * numbers up to `maxUnit` count; admins correct or set the rest.
 */
export function guessUnit(title: string, maxUnit = 16): number | null {
  const western = title.replace(/[٠-٩]/g, (d) => String(ARABIC_DIGITS.indexOf(d)));
  const m = /(?:الدرس|الوحدة|lesson|unit|lektion|einheit)\s*(?:رقم\s*)?(\d{1,3})/i.exec(
    western
  );
  if (!m) return null;
  const n = Number(m[1]);
  return n >= 1 && n <= maxUnit ? n : null;
}
