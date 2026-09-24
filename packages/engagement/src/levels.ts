/**
 * XP levels (engagement plan §2): a gentle curve, level n + 1 needs 50·n^1.5 XP in total.
 * Separate from the book levels ("Stufe"), which follow the units.
 */

/** Total XP needed to reach `level` (level 1 needs nothing). */
export function xpForLevel(level: number): number {
  return level <= 1 ? 0 : Math.round(50 * (level - 1) ** 1.5);
}

export interface Level {
  level: number;
  /** XP earned inside the current level. */
  into: number;
  /** XP the current level spans (to the next one). */
  span: number;
}

export function levelFor(totalXp: number): Level {
  let level = 1;
  while (xpForLevel(level + 1) <= totalXp) level++;
  const base = xpForLevel(level);
  return { level, into: totalXp - base, span: xpForLevel(level + 1) - base };
}
