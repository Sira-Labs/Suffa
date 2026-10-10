/**
 * Background update of the course content (story 16.2): asks the API for the newest published
 * bundle, downloads it when it is newer than the one in use, checks its sha256 against the
 * manifest and keeps it for the next start. Never blocks the app: offline, without an API or
 * on any error the app keeps the content it has.
 */
import {
  BUNDLE_STORAGE_KEY,
  deviceStorage,
  parseBundle,
  readStoredBundle,
} from '@/content/bundle';
import { logger } from '@/services/logger';

const log = logger.child('content:bundle');

export interface Manifest {
  version: number;
  checksum: string;
  size: number;
  createdAt: string;
  url: string;
}

export type UpdateResult =
  | { status: 'updated'; version: number }
  | { status: 'current'; version: number }
  | { status: 'unavailable' }
  | { status: 'invalid'; reason: string };

/** Bundles above this size are refused (all units together are a few hundred kB). */
const MAX_BUNDLE_BYTES = 5 * 1024 * 1024;

interface Options {
  fetchImpl?: typeof fetch;
  storage?: Pick<Storage, 'getItem' | 'setItem'> | null;
  /** The bundle version the running app uses (0: the built-in units). */
  inUse: number;
}

export async function updateContentBundle({
  fetchImpl = (...args) => fetch(...args),
  storage = deviceStorage(),
  inUse,
}: Options): Promise<UpdateResult> {
  if (!storage) return { status: 'unavailable' };
  let manifest: Manifest;
  try {
    const res = await fetchImpl('/api/v1/content/manifest', { credentials: 'omit' });
    if (!res.ok) return { status: 'unavailable' };
    manifest = (await res.json()) as Manifest;
  } catch {
    return { status: 'unavailable' };
  }
  if (!isManifest(manifest)) return { status: 'invalid', reason: 'manifest' };

  // Already downloaded (waiting for the next start) or in use.
  const stored = readStoredBundle(storage)?.version ?? 0;
  if (manifest.version <= Math.max(stored, inUse)) {
    return { status: 'current', version: Math.max(stored, inUse) };
  }
  if (manifest.size > MAX_BUNDLE_BYTES) return { status: 'invalid', reason: 'size' };

  let text: string;
  try {
    const res = await fetchImpl(manifest.url, { credentials: 'omit' });
    if (!res.ok) return { status: 'unavailable' };
    text = await res.text();
  } catch {
    return { status: 'unavailable' };
  }
  if ((await sha256Hex(text)) !== manifest.checksum) {
    log.warn('content bundle checksum mismatch', { version: manifest.version });
    return { status: 'invalid', reason: 'checksum' };
  }
  const bundle = parseBundle(text);
  if (!bundle || bundle.version !== manifest.version) {
    return { status: 'invalid', reason: 'format' };
  }
  try {
    storage.setItem(BUNDLE_STORAGE_KEY, text);
  } catch (error) {
    // Quota exceeded or storage blocked: keep the content in use.
    log.warn('content bundle not stored', {
      message: error instanceof Error ? error.message : String(error),
    });
    return { status: 'unavailable' };
  }
  log.info('content bundle downloaded, active on next start', {
    version: bundle.version,
  });
  return { status: 'updated', version: bundle.version };
}

function isManifest(value: unknown): value is Manifest {
  if (!value || typeof value !== 'object') return false;
  const m = value as Record<string, unknown>;
  return (
    typeof m.version === 'number' &&
    Number.isInteger(m.version) &&
    m.version > 0 &&
    typeof m.checksum === 'string' &&
    /^[0-9a-f]{64}$/.test(m.checksum) &&
    typeof m.size === 'number' &&
    typeof m.url === 'string' &&
    // Only bundles from this API, never another origin.
    /^\/api\/v1\/content\/bundles\/\d+$/.test(m.url)
  );
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
