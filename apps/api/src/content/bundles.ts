/**
 * Content bundles (story 16.2, ADR-0014): all published units frozen into one immutable JSON
 * document with a version and a sha256 checksum. Clients keep the newest one offline.
 *
 * Removed items are tombstoned: an item that was in the previous bundle and is gone now stays
 * in `tombstones` with its last published content, so SRS cards that point at it still show
 * it. Tombstones carry forward from bundle to bundle; an item that comes back leaves them.
 */
import { createHash } from 'node:crypto';
import type pg from 'pg';
import type { UnitFile } from './schema.js';

export const BUNDLE_FORMAT = 1;
/** The course whose units the bundles carry (the bundled unit files, ADR-0025). */
export const BUNDLE_COURSE = 'bayna-yadayk';

export type TombstoneKind = 'vocab' | 'dialog' | 'grammar';

export interface Tombstone {
  id: string;
  kind: TombstoneKind;
  unit: number;
  /** The item as it was last published. */
  item: unknown;
}

export interface ContentBundle {
  format: typeof BUNDLE_FORMAT;
  version: number;
  createdAt: string;
  course: string;
  units: UnitFile[];
  tombstones: Tombstone[];
}

export interface BundleInfo {
  version: number;
  checksum: string;
  size: number;
  createdAt: string;
}

/** Items with an ID, by kind (quiz questions travel inside their grammar point). */
function itemsOf(units: readonly UnitFile[]): Tombstone[] {
  return units.flatMap((u) => [
    ...u.vokabeln.map((item) => ({
      id: item.id,
      kind: 'vocab' as const,
      unit: u.einheit,
      item,
    })),
    ...u.dialoge.map((item) => ({
      id: item.id,
      kind: 'dialog' as const,
      unit: u.einheit,
      item,
    })),
    ...u.grammatik.map((item) => ({
      id: item.id,
      kind: 'grammar' as const,
      unit: u.einheit,
      item,
    })),
  ]);
}

/** The tombstones of the next bundle: what was published before and is gone now. */
export function nextTombstones(
  units: readonly UnitFile[],
  previous: Pick<ContentBundle, 'units' | 'tombstones'> | null
): Tombstone[] {
  if (!previous) return [];
  const live = new Set(itemsOf(units).map((i) => i.id));
  const byId = new Map<string, Tombstone>();
  // Older tombstones first, so the last published version of an item wins.
  for (const stone of [...previous.tombstones, ...itemsOf(previous.units)]) {
    if (!live.has(stone.id)) byId.set(stone.id, stone);
  }
  return [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
}

export function checksumOf(body: string): string {
  return createHash('sha256').update(body, 'utf8').digest('hex');
}

/** Any fixed number: serialises bundle creation across API instances (pg_advisory_xact_lock). */
const BUNDLE_LOCK = 160_002;

/**
 * Freezes the published units into a new bundle when they differ from the newest one; returns
 * its version, or null when nothing changed. Runs inside the caller's transaction.
 */
export async function createBundleIfChanged(
  client: pg.PoolClient,
  createdBy: string | null
): Promise<number | null> {
  await client.query('select pg_advisory_xact_lock($1)', [BUNDLE_LOCK]);
  const { rows: unitRows } = await client.query<{ published: UnitFile }>(
    `select published from content_units
      where course = $1 and published is not null
      order by unit`,
    [BUNDLE_COURSE]
  );
  const units = unitRows.map((r) => r.published);
  const { rows: latest } = await client.query<{ version: number; body: string }>(
    `select version, body from content_bundles order by version desc limit 1`
  );
  const previous = latest[0] ? (JSON.parse(latest[0].body) as ContentBundle) : null;
  const tombstones = nextTombstones(units, previous);
  if (
    previous &&
    sameJson(previous.units, units) &&
    sameJson(previous.tombstones, tombstones)
  ) {
    return null;
  }
  if (!previous && units.length === 0) return null;

  const version = (latest[0]?.version ?? 0) + 1;
  const bundle: ContentBundle = {
    format: BUNDLE_FORMAT,
    version,
    createdAt: new Date().toISOString(),
    course: BUNDLE_COURSE,
    units,
    tombstones,
  };
  const body = JSON.stringify(bundle);
  await client.query(
    `insert into content_bundles
       (version, checksum, body, size_bytes, unit_count, tombstone_count, created_by)
     values ($1, $2, $3, $4, $5, $6, $7)`,
    [
      version,
      checksumOf(body),
      body,
      Buffer.byteLength(body, 'utf8'),
      units.length,
      tombstones.length,
      createdBy,
    ]
  );
  return version;
}

/** Equal as JSON values, whatever the key order (jsonb does not keep it). */
function sameJson(a: unknown, b: unknown): boolean {
  return canonical(a) === canonical(b);
}

function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(
          Object.entries(v as Record<string, unknown>).sort(([x], [y]) =>
            x.localeCompare(y)
          )
        )
      : v
  );
}
