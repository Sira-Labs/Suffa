/**
 * Training draws only on the units the learner has reached (unlocked): the Training area and
 * "Heute" never offer words, dialogues or verbs of units still ahead. Pure helpers, so the
 * SRS scope, the modules and tests agree.
 */
import type { ContentBundle, UserVocab } from '@/types';

/** Keeps items of reached units; items without a unit (own words, drills) always stay. */
export function inReachedUnits(
  units: readonly number[]
): <T extends { einheit?: number | null }>(item: T) => boolean {
  const reached = new Set(units);
  return (item) => item.einheit == null || reached.has(item.einheit);
}

/** Content items new SRS cards may come from. */
export function introducibleRefs(
  bundle: Pick<
    ContentBundle,
    'vokabeln' | 'verben' | 'nisba' | 'phonologie_minimalpaare'
  >,
  units: readonly number[],
  userVocab: readonly Pick<UserVocab, 'id'>[]
): Set<string> {
  const keep = inReachedUnits(units);
  return new Set([
    ...bundle.vokabeln.filter(keep).map((v) => v.id),
    ...bundle.verben.filter(keep).map((v) => v.id),
    ...bundle.nisba.map((n) => n.id),
    ...bundle.phonologie_minimalpaare.map((m) => m.id),
    ...userVocab.map((v) => v.id),
  ]);
}
