/**
 * The seed of the CMS (story 16.1): the unit files the web app bundles today
 * (`apps/web/src/content/units/einheit-NN.json`). They are read at start-up and every unit
 * that is not in the database yet is inserted as published, so a fresh database starts with
 * exactly what learners see. Units already in the database are never touched again.
 *
 * The API image copies the files to the same relative path (infra/docker/api.Dockerfile);
 * SUFFA_CONTENT_SEED_DIR points elsewhere if needed.
 */
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ContentRepository, SeedUnit } from './repository.js';
import { contentOfFile, UnitFileSchema, validateUnitContent } from './schema.js';

/** apps/api/{src,dist}/content → apps/web/src/content/units */
export const DEFAULT_SEED_DIR = fileURLToPath(
  new URL('../../../web/src/content/units/', import.meta.url)
);

/** The course the bundled unit files belong to (ADR-0025). */
const SEED_COURSE = 'bayna-yadayk';

const UNIT_FILE = /^einheit-\d+\.json$/;

export class SeedError extends Error {}

/** Reads and validates every unit file in `dir`; throws a SeedError naming the bad file. */
export async function loadSeedUnits(dir: string): Promise<SeedUnit[]> {
  const names = (await readdir(dir)).filter((n) => UNIT_FILE.test(n)).sort();
  const units: SeedUnit[] = [];
  for (const name of names) {
    let raw: unknown;
    try {
      raw = JSON.parse(await readFile(join(dir, name), 'utf8'));
    } catch (error) {
      if (error instanceof SyntaxError) throw new SeedError(`${name}: ${error.message}`);
      throw error;
    }
    const file = UnitFileSchema.safeParse(raw);
    if (!file.success) {
      const issue = file.error.issues[0]!;
      throw new SeedError(`${name}: ${issue.path.join('.')}: ${issue.message}`);
    }
    const checked = validateUnitContent(file.data.einheit, contentOfFile(file.data));
    if (!checked.ok) throw new SeedError(`${name}: ${checked.issues[0]}`);
    units.push({ course: SEED_COURSE, file: file.data });
  }
  return units;
}

export interface SeedLog {
  info(obj: object, msg: string): void;
  error(obj: object, msg: string): void;
}

/**
 * Seeds missing units at start-up. A broken or missing seed is logged, not fatal: the API
 * keeps serving everything else, and the CMS shows what is in the database.
 */
export async function seedContent(
  repo: ContentRepository,
  dir: string,
  log: SeedLog
): Promise<number> {
  let units: SeedUnit[];
  try {
    units = await loadSeedUnits(dir);
  } catch (error) {
    if (error instanceof SeedError || isMissingDir(error)) {
      log.error({ dir, error: String(error) }, 'content.seed_unreadable');
      return 0;
    }
    throw error;
  }
  const inserted = await repo.seed(units);
  if (inserted > 0) log.info({ inserted, files: units.length }, 'content.seeded');
  return inserted;
}

function isMissingDir(error: unknown): boolean {
  return error instanceof Error && (error as NodeJS.ErrnoException).code === 'ENOENT';
}
