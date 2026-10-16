/**
 * Class settings shared by the app and the server (story 18.1/18.2):
 *
 * - the colour scheme a teacher picks for the class (the app styles it; the server only
 *   validates the id);
 * - when the practice areas open for the class's learners: always, from a unit of the
 *   class's course on, or not until the teacher opens them.
 *
 * A learner without a class gets DEFAULT_UNLOCKS.
 */
import { courseById, type CourseId } from './courses.js';
import type { ExamEntry } from './records.js';
import { isUnlocked } from './units.js';

export const PALETTE_IDS = ['oase', 'meer', 'minze', 'lavendel', 'sand'] as const;
export type PaletteId = (typeof PALETTE_IDS)[number];
export const DEFAULT_PALETTE: PaletteId = 'oase';

export function isPaletteId(value: unknown): value is PaletteId {
  return typeof value === 'string' && (PALETTE_IDS as readonly string[]).includes(value);
}

/** Practice areas a teacher can open and close (the "Üben" hub and its pages). */
export const AREA_IDS = [
  'alphabet',
  'vocab',
  'reading',
  'writing',
  'speaking',
  'roots',
  'conjugation',
  'exam',
] as const;
export type AreaId = (typeof AREA_IDS)[number];

export function isAreaId(value: unknown): value is AreaId {
  return typeof value === 'string' && (AREA_IDS as readonly string[]).includes(value);
}

export type AreaRule =
  | { mode: 'open' }
  /** Opens once the learner reached this unit (counted within the course, from 1). */
  | { mode: 'unit'; unit: number }
  /** Closed until the teacher opens it. */
  | { mode: 'closed' };

export type AreaUnlocks = Partial<Record<AreaId, AreaRule>>;

/** A well-formed rule (for data read back from storage). */
export function isAreaRule(value: unknown): value is AreaRule {
  if (typeof value !== 'object' || value === null) return false;
  const rule = value as { mode?: unknown; unit?: unknown };
  if (rule.mode === 'open' || rule.mode === 'closed') return true;
  return (
    rule.mode === 'unit' &&
    typeof rule.unit === 'number' &&
    Number.isInteger(rule.unit) &&
    rule.unit >= 1
  );
}

/** Unlocks with known areas and well-formed rules only. */
export function isAreaUnlocks(value: unknown): value is AreaUnlocks {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  return Object.entries(value).every(
    ([area, rule]) => isAreaId(area) && isAreaRule(rule)
  );
}

/** Roots need a few units of vocabulary first (teacher feedback); everything else is open. */
export const DEFAULT_UNLOCKS: Readonly<Record<AreaId, AreaRule>> = {
  alphabet: { mode: 'open' },
  vocab: { mode: 'open' },
  reading: { mode: 'open' },
  writing: { mode: 'open' },
  speaking: { mode: 'open' },
  roots: { mode: 'unit', unit: 3 },
  conjugation: { mode: 'open' },
  exam: { mode: 'open' },
};

/** The class's rule for an area, falling back to the default. */
export function ruleFor(unlocks: AreaUnlocks | null | undefined, area: AreaId): AreaRule {
  return unlocks?.[area] ?? DEFAULT_UNLOCKS[area];
}

/**
 * How far the learner got in a course: the position (from 1) of the last unit they reached.
 * The first unit is always reached.
 */
export function reachedPosition(course: CourseId, exams: readonly ExamEntry[]): number {
  const units = courseById(course).units;
  let position = 1;
  units.forEach((unit, index) => {
    if (isUnlocked(unit, exams)) position = Math.max(position, index + 1);
  });
  return position;
}

export type AreaAccess =
  | { open: true }
  | { open: false; reason: 'unit'; unit: number }
  | { open: false; reason: 'closed' };

/** Whether an area is open for a learner who reached `position` in the course. */
export function areaAccess(rule: AreaRule, position: number): AreaAccess {
  if (rule.mode === 'open') return { open: true };
  if (rule.mode === 'closed') return { open: false, reason: 'closed' };
  return position >= rule.unit
    ? { open: true }
    : { open: false, reason: 'unit', unit: rule.unit };
}
