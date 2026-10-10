import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  BUNDLE_STORAGE_KEY,
  mergeUnits,
  parseBundle,
  readStoredBundle,
} from '@/content/bundle';
import type { ContentBundle } from '@/content/bundle';
import { updateContentBundle } from './bundleUpdater';

const unit = (einheit: number, titel = `Einheit ${einheit}`) => ({
  einheit,
  titel,
  vokabeln: [{ id: `v-${einheit}`, ar: 'ب', tr: 'b', de: 'B', wurzel: '', einheit }],
  dialoge: [],
  grammatik: [],
});

const bundle = (version: number, patch: Partial<ContentBundle> = {}): ContentBundle => ({
  format: 1,
  version,
  createdAt: '2026-10-10T00:00:00.000Z',
  course: 'bayna-yadayk',
  units: [unit(1, 'Neu aus dem CMS')],
  tombstones: [],
  ...patch,
});

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: vi.fn((key: string, value: string) => {
      data.set(key, value);
    }),
  };
}

/** A fake API serving one bundle; `tamper` changes the bytes after the checksum. */
async function fakeApi(served: ContentBundle, tamper = false) {
  const text = JSON.stringify(served);
  const manifest = {
    version: served.version,
    checksum: await sha256(text),
    size: text.length,
    createdAt: served.createdAt,
    url: `/api/v1/content/bundles/${served.version}`,
  };
  const requests: string[] = [];
  const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
    const path = String(input);
    requests.push(path);
    if (path === '/api/v1/content/manifest') return Response.json(manifest);
    if (path === manifest.url) return new Response(tamper ? `${text} ` : text);
    return new Response(null, { status: 404 });
  }) as unknown as typeof fetch;
  return { fetchImpl, manifest, requests, text };
}

describe('content bundles on the device (story 16.2)', () => {
  it('accepts only bundles of the known shape', () => {
    expect(parseBundle(JSON.stringify(bundle(3)))?.version).toBe(3);
    expect(parseBundle('{ broken')).toBeNull();
    expect(parseBundle(JSON.stringify({ ...bundle(3), format: 2 }))).toBeNull();
    expect(parseBundle(JSON.stringify({ ...bundle(3), version: 0 }))).toBeNull();
    expect(
      parseBundle(JSON.stringify({ ...bundle(3), units: [{ einheit: 1 }] }))
    ).toBeNull();
    expect(readStoredBundle(null)).toBeNull();
    const throwing = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {},
    };
    expect(readStoredBundle(throwing)).toBeNull();
  });

  it('replaces built-in units by number and keeps units the bundle lacks', () => {
    const merged = mergeUnits([unit(1), unit(2)], bundle(3));
    expect(merged.map((u) => [u.einheit, u.titel])).toEqual([
      [1, 'Neu aus dem CMS'],
      [2, 'Einheit 2'],
    ]);
    expect(mergeUnits([unit(1)], null)).toEqual([unit(1)]);
  });
});

describe('background content update (story 16.2)', () => {
  afterEach(() => vi.restoreAllMocks());

  it('downloads a newer bundle, checks it and keeps it for the next start', async () => {
    const { fetchImpl, text } = await fakeApi(bundle(4));
    const storage = memoryStorage();
    expect(await updateContentBundle({ fetchImpl, storage, inUse: 0 })).toEqual({
      status: 'updated',
      version: 4,
    });
    expect(storage.data.get(BUNDLE_STORAGE_KEY)).toBe(text);
    // The next check finds it downloaded and fetches nothing more.
    const again = await fakeApi(bundle(4));
    expect(
      await updateContentBundle({ fetchImpl: again.fetchImpl, storage, inUse: 0 })
    ).toEqual({ status: 'current', version: 4 });
    expect(again.requests).toEqual(['/api/v1/content/manifest']);
  });

  it('does nothing when the app already uses that version', async () => {
    const { fetchImpl, requests } = await fakeApi(bundle(4));
    const storage = memoryStorage();
    expect(await updateContentBundle({ fetchImpl, storage, inUse: 4 })).toEqual({
      status: 'current',
      version: 4,
    });
    expect(requests).toHaveLength(1);
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it('refuses a bundle whose bytes do not match the checksum', async () => {
    const { fetchImpl } = await fakeApi(bundle(4), true);
    const storage = memoryStorage();
    expect(await updateContentBundle({ fetchImpl, storage, inUse: 0 })).toEqual({
      status: 'invalid',
      reason: 'checksum',
    });
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it('only follows bundle URLs of this API', async () => {
    const { manifest } = await fakeApi(bundle(4));
    const fetchImpl = vi.fn(async () =>
      Response.json({ ...manifest, url: 'https://evil.example/bundle.json' })
    ) as unknown as typeof fetch;
    expect(
      await updateContentBundle({ fetchImpl, storage: memoryStorage(), inUse: 0 })
    ).toEqual({
      status: 'invalid',
      reason: 'manifest',
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('keeps the content in use offline, without an API or without room to store', async () => {
    const offline = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    }) as unknown as typeof fetch;
    expect(
      await updateContentBundle({
        fetchImpl: offline,
        storage: memoryStorage(),
        inUse: 0,
      })
    ).toEqual({ status: 'unavailable' });

    const noApi = vi.fn(
      async () => new Response(JSON.stringify({ error: 'no_bundle' }), { status: 404 })
    ) as unknown as typeof fetch;
    expect(
      await updateContentBundle({ fetchImpl: noApi, storage: memoryStorage(), inUse: 0 })
    ).toEqual({ status: 'unavailable' });

    const { fetchImpl } = await fakeApi(bundle(5));
    const full = memoryStorage();
    full.setItem.mockImplementation(() => {
      throw new DOMException('quota', 'QuotaExceededError');
    });
    expect(await updateContentBundle({ fetchImpl, storage: full, inUse: 0 })).toEqual({
      status: 'unavailable',
    });
    expect(await updateContentBundle({ fetchImpl, storage: null, inUse: 0 })).toEqual({
      status: 'unavailable',
    });
  });
});
