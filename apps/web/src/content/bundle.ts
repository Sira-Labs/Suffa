/**
 * Published content bundles on the device (story 16.2, ADR-0014). The app ships the unit files
 * it was built with; a newer bundle downloaded in the background (services/content/
 * bundleUpdater.ts) is kept in localStorage and replaces those units on the next start.
 *
 * localStorage on purpose: the content modules are evaluated synchronously at start-up, and a
 * bundle of all units is a few hundred kilobytes. Anything unreadable falls back to the units
 * the app was built with, so the first run and a broken store both work offline.
 */
import type { Dialog, GrammatikPunkt, Vokabel } from '@/types';

export const BUNDLE_STORAGE_KEY = 'suffa.content.bundle';
export const BUNDLE_FORMAT = 1;

export interface BundleUnit {
  einheit: number;
  titel: string;
  status?: 'entwurf' | 'geprueft';
  kulturnotiz?: string;
  vokabeln: Vokabel[];
  dialoge: Dialog[];
  grammatik?: GrammatikPunkt[];
}

/** An item that was removed after being published, with its last content. */
export interface Tombstone {
  id: string;
  kind: 'vocab' | 'dialog' | 'grammar';
  unit: number;
  item: unknown;
}

export interface ContentBundle {
  format: number;
  version: number;
  createdAt: string;
  course: string;
  units: BundleUnit[];
  tombstones: Tombstone[];
}

type Storage = Pick<globalThis.Storage, 'getItem' | 'setItem'>;

/** localStorage, or null where it is unavailable (private mode, native shell without it). */
export function deviceStorage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

function isUnit(value: unknown): value is BundleUnit {
  if (!value || typeof value !== 'object') return false;
  const u = value as Record<string, unknown>;
  return (
    typeof u.einheit === 'number' &&
    typeof u.titel === 'string' &&
    Array.isArray(u.vokabeln) &&
    Array.isArray(u.dialoge) &&
    (u.grammatik === undefined || Array.isArray(u.grammatik))
  );
}

/** A parsed bundle when it has the shape the app relies on, else null. */
export function parseBundle(text: string): ContentBundle | null {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return null;
  }
  if (!value || typeof value !== 'object') return null;
  const b = value as Record<string, unknown>;
  if (
    b.format !== BUNDLE_FORMAT ||
    typeof b.version !== 'number' ||
    !Number.isInteger(b.version) ||
    b.version < 1 ||
    !Array.isArray(b.units) ||
    !b.units.every(isUnit) ||
    !Array.isArray(b.tombstones)
  ) {
    return null;
  }
  return value as ContentBundle;
}

/** The bundle kept on this device, or null (none, unreadable or of another format). */
export function readStoredBundle(
  storage: Storage | null = deviceStorage()
): ContentBundle | null {
  try {
    const text = storage?.getItem(BUNDLE_STORAGE_KEY);
    return text ? parseBundle(text) : null;
  } catch {
    return null;
  }
}

/**
 * The units the app uses: the bundle's units replace the built-in ones of the same number;
 * built-in units the bundle does not have yet (a unit shipped with a newer app) stay.
 */
export function mergeUnits<U extends { einheit: number }>(
  builtIn: readonly U[],
  bundle: ContentBundle | null
): (U | BundleUnit)[] {
  if (!bundle) return [...builtIn];
  const fromBundle = new Map<number, U | BundleUnit>(
    bundle.units.map((u) => [u.einheit, u])
  );
  for (const unit of builtIn)
    if (!fromBundle.has(unit.einheit)) fromBundle.set(unit.einheit, unit);
  return [...fromBundle.values()].sort((a, b) => a.einheit - b.einheit);
}

/** Removed vocabulary, still needed to show the SRS cards that point at it. */
export function retiredVocabulary(bundle: ContentBundle | null): Vokabel[] {
  return (bundle?.tombstones ?? [])
    .filter((t) => t.kind === 'vocab' && t.item && typeof t.item === 'object')
    .map((t) => t.item as Vokabel);
}
