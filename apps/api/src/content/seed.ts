/**
 * The seed of the CMS (story 16.1): the unit files the web app bundles
 * (`apps/web/src/content/units/einheit-NN.json`). They are read at start-up: every unit that is
 * not in the database yet is inserted as published, so a fresh database starts with exactly
 * what learners see. A unit nobody edited in the CMS follows its seed file; once edited, the
 * CMS owns it and the file no longer touches it.
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
 * Seeds missing units at start-up and makes sure a content bundle holds what is published
 * (story 16.2); returns how many units were inserted or refreshed. A broken or missing seed is
 * logged, not fatal: the API keeps serving everything else, and the CMS shows what is in the
 * database.
 */
export async function seedContent(
  repo: ContentRepository,
  dir: string,
  log: SeedLog
): Promise<number> {
  let units: SeedUnit[] | null = null;
  try {
    units = await loadSeedUnits(dir);
  } catch (error) {
    if (!(error instanceof SeedError || isMissingDir(error))) throw error;
    log.error({ dir, error: String(error) }, 'content.seed_unreadable');
  }
  let changed = 0;
  if (units) {
    const { inserted, refreshed } = await repo.seed(units);
    changed = inserted + refreshed;
    if (changed > 0)
      log.info({ inserted, refreshed, files: units.length }, 'content.seeded');
  }
  const bundle = await repo.ensureBundle();
  if (bundle !== null) log.info({ version: bundle }, 'content.bundle_created');
  return changed;
}

function isMissingDir(error: unknown): boolean {
  return error instanceof Error && (error as NodeJS.ErrnoException).code === 'ENOENT';
}
