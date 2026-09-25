import { describe, expect, it, vi } from 'vitest';
import {
  offlineAudioUrl,
  offlineMeta,
  offlineSupported,
  removeOffline,
  saveOffline,
} from './offline';

/** A tiny in-memory CacheStorage. */
function memoryCaches() {
  const entries = new Map<string, Response>();
  const cache = {
    put: async (key: string, response: Response) =>
      void entries.set(key, response.clone()),
    match: async (key: string) => entries.get(key)?.clone(),
    delete: async (key: string) => entries.delete(key),
  };
  return { open: async () => cache, delete: async () => true } as unknown as CacheStorage;
}

describe('offline recordings', () => {
  it('stores audio and player data and reads them back', async () => {
    // jsdom has no object URLs.
    URL.createObjectURL ??= () => 'blob:test';
    const store = memoryCaches();
    expect(offlineSupported(store)).toBe(true);
    expect(offlineSupported(null)).toBe(false);
    const fetchImpl = vi.fn(
      async () => new Response(new Blob(['aac-bytes']))
    ) as unknown as typeof fetch;
    const meta = {
      mediaId: 'm1',
      classId: 'c1',
      title: 'Stunde 1',
      durationSec: 120,
      cues: [{ start: 0, end: 2, text: 'مرحبا' }],
      checkpoints: [],
    };
    expect(await saveOffline(meta, '/media/x', fetchImpl, store)).toBe(true);
    expect(await offlineMeta('m1', store)).toMatchObject({
      title: 'Stunde 1',
      cues: meta.cues,
    });
    const url = await offlineAudioUrl('m1', store);
    expect(url).toMatch(/^blob:/);
    await removeOffline('m1', store);
    expect(await offlineMeta('m1', store)).toBeNull();
    expect(await offlineAudioUrl('m1', store)).toBeNull();
  });

  it('does nothing without Cache Storage or when the download fails', async () => {
    const meta = {
      mediaId: 'm',
      classId: 'c',
      title: 't',
      durationSec: null,
      cues: [],
      checkpoints: [],
    };
    expect(await saveOffline(meta, '/x', fetch, null)).toBe(false);
    const failing = vi.fn(
      async () => new Response(null, { status: 403 })
    ) as unknown as typeof fetch;
    expect(await saveOffline(meta, '/x', failing, memoryCaches())).toBe(false);
    expect(await offlineMeta('m', null)).toBeNull();
  });
});
