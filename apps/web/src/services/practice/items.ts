/**
 * What a unit offers per skill, from the content bundle: the items a learner practises in the
 * unit's reading, writing, speaking and verb stations. Pure, so stations and tests share it.
 */
import type {
  ContentBundle,
  PracticeRecord,
  PracticeSkill,
  UnitPracticeScope,
} from '@/types';

export const PRACTICE_SKILLS: readonly PracticeSkill[] = [
  'read',
  'write',
  'speak',
  'verbs',
];

/** Dialogue line id for speaking: `${dialogId}#${index}`. */
export function lineId(dialogId: string, index: number): string {
  return `${dialogId}#${index}`;
}

export function unitPracticeItems(
  bundle: Pick<ContentBundle, 'dialoge' | 'vokabeln' | 'verben'>,
  unit: number
): Record<PracticeSkill, string[]> {
  const dialogues = bundle.dialoge.filter((d) => d.einheit === unit);
  return {
    read: dialogues.map((d) => d.id),
    write: bundle.vokabeln.filter((v) => v.einheit === unit).map((v) => v.id),
    speak: dialogues.flatMap((d) => d.zeilen.map((_, i) => lineId(d.id, i))),
    verbs: bundle.verben.filter((v) => v.einheit === unit).map((v) => v.id),
  };
}

export function practiceId(unit: number, skill: PracticeSkill, itemId: string): string {
  return `${unit}:${skill}:${itemId}`;
}

/** Items of a skill done, counting only items the unit still offers. */
export function practiceCount(
  records: Readonly<Record<string, PracticeRecord>>,
  unit: number,
  skill: PracticeSkill,
  items: readonly string[]
): number {
  return items.filter((item) => records[practiceId(unit, skill, item)]).length;
}

/** Dialogues a scoped module offers: the unit's, narrowed to a section's if given. */
export function scopedDialogues<D extends { id: string; einheit: number }>(
  dialogues: readonly D[],
  scope: UnitPracticeScope
): D[] {
  return dialogues.filter(
    (d) =>
      d.einheit === scope.unit && (!scope.dialogIds || scope.dialogIds.includes(d.id))
  );
}

/** Words a scoped module offers: the unit's, narrowed to a section's if given. */
export function scopedWords<W extends { id: string; einheit: number }>(
  words: readonly W[],
  scope: UnitPracticeScope
): W[] {
  return words.filter(
    (w) => w.einheit === scope.unit && (!scope.wordIds || scope.wordIds.includes(w.id))
  );
}
