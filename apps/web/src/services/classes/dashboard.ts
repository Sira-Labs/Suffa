/**
 * Pure helpers for the class dashboard (story 6.1): the server sends aggregates by content
 * id; the teacher's app knows which unit and word each id is.
 */

interface Word {
  id: string;
  einheit: number;
  ar: string;
  de: string;
}

/**
 * Class mastery per unit: the share of (learner × word) pairs of the unit with a mature
 * card. 100 % = every learner has every word of the unit firmly in memory.
 */
export function classMasteryByUnit(
  matureByRef: Readonly<Record<string, number>>,
  learners: number,
  words: readonly Word[]
): Map<number, number> {
  const perUnit = new Map<number, { words: number; mature: number }>();
  for (const word of words) {
    const entry = perUnit.get(word.einheit) ?? { words: 0, mature: 0 };
    entry.words++;
    entry.mature += Math.min(learners, matureByRef[word.id] ?? 0);
    perUnit.set(word.einheit, entry);
  }
  return new Map(
    [...perUnit].map(([unit, e]) => [
      unit,
      learners === 0 ? 0 : Math.round((e.mature / (e.words * learners)) * 100),
    ])
  );
}

/** Leech ids resolved to words; ids of unknown or own words are left out. */
export function leechWords(
  leeches: readonly { contentRef: string; learners: number }[],
  words: readonly Word[]
): (Word & { learners: number })[] {
  const byId = new Map(words.map((w) => [w.id, w]));
  return leeches.flatMap((l) => {
    const word = byId.get(l.contentRef);
    return word ? [{ ...word, learners: l.learners }] : [];
  });
}

/** "heute", "gestern", "vor 5 Tagen", or "noch nie" (German). */
export function lastActiveLabel(iso: string | null, now: Date = new Date()): string {
  if (!iso) return 'noch nie';
  const day = (d: Date) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  const days = Math.round((day(now) - day(new Date(iso))) / 86_400_000);
  if (days <= 0) return 'heute';
  if (days === 1) return 'gestern';
  return `vor ${days} Tagen`;
}

/** Learners without activity for this many days are highlighted. */
export const INACTIVE_AFTER_DAYS = 3;

export function isInactive(iso: string | null, now: Date = new Date()): boolean {
  return !iso || now.getTime() - Date.parse(iso) > INACTIVE_AFTER_DAYS * 86_400_000;
}
