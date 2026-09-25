/**
 * Offline recordings (story 8.4): the audio version and everything the player needs
 * (title, transcript, checkpoints) are kept in Cache Storage, so a lesson plays and its
 * checkpoints work in flight mode. Only the small audio file is stored, never the video.
 */
import type { Checkpoint, Cue } from './checkpoints';

export const OFFLINE_CACHE = 'suffa-recordings-v1';

export interface OfflineMeta {
  mediaId: string;
  classId: string;
  title: string;
  durationSec: number | null;
  cues: Cue[];
  checkpoints: Checkpoint[];
  savedAt: string;
}

const audioKey = (mediaId: string) => `/offline/recordings/${mediaId}/audio`;
const metaKey = (mediaId: string) => `/offline/recordings/${mediaId}/meta`;

type Caches = Pick<CacheStorage, 'open' | 'delete'>;

function cacheStorage(): Caches | null {
  return typeof caches === 'undefined' ? null : caches;
}

export function offlineSupported(store: Caches | null = cacheStorage()): boolean {
  return store !== null;
}

/** Downloads the audio (presigned URL) and stores it with the player's data. */
export async function saveOffline(
  meta: Omit<OfflineMeta, 'savedAt'>,
  audioUrl: string,
  fetchImpl: typeof fetch = fetch,
  store: Caches | null = cacheStorage()
): Promise<boolean> {
  if (!store) return false;
  const response = await fetchImpl(audioUrl);
  if (!response.ok) return false;
  const cache = await store.open(OFFLINE_CACHE);
  await cache.put(
    audioKey(meta.mediaId),
    new Response(await response.blob(), { headers: { 'content-type': 'audio/mp4' } })
  );
  await cache.put(
    metaKey(meta.mediaId),
    Response.json({ ...meta, savedAt: new Date().toISOString() })
  );
  return true;
}

export async function offlineMeta(
  mediaId: string,
  store: Caches | null = cacheStorage()
): Promise<OfflineMeta | null> {
  if (!store) return null;
  const hit = await (await store.open(OFFLINE_CACHE)).match(metaKey(mediaId));
  return hit ? ((await hit.json()) as OfflineMeta) : null;
}

/** A blob URL of the stored audio (revoke it when done), or null. */
export async function offlineAudioUrl(
  mediaId: string,
  store: Caches | null = cacheStorage()
): Promise<string | null> {
  if (!store) return null;
  const hit = await (await store.open(OFFLINE_CACHE)).match(audioKey(mediaId));
  return hit ? URL.createObjectURL(await hit.blob()) : null;
}

export async function removeOffline(
  mediaId: string,
  store: Caches | null = cacheStorage()
): Promise<void> {
  if (!store) return;
  const cache = await store.open(OFFLINE_CACHE);
  await cache.delete(audioKey(mediaId));
  await cache.delete(metaKey(mediaId));
}
