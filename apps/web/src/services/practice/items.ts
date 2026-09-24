/**
 * What a unit offers per skill, from the content bundle: the items a learner practises in the
 * unit's reading, writing, speaking and verb stations. Pure, so stations and tests share it.
 */
import type {
  ContentBundle,
  Dialog,
  GrammatikPunkt,
  PracticeRecord,
  PracticeSkill,
  UnitPracticeScope,
} from '@/types';

export const PRACTICE_SKILLS: readonly PracticeSkill[] = [
  'read',
  'grammar',
  'cloze',
  'write',
  'speak',
  'verbs',
];

/** Dialogue line id for speaking: `${dialogId}#${index}`. */
export function lineId(dialogId: string, index: number): string {
  return `${dialogId}#${index}`;
}

/** The writing station's exercises, in learning order (copying first). */
export const WRITE_EXERCISES = [
  'abschreiben',
  'diktat',
  'umschrift',
  'satzbau',
  'uebersetzung',
] as const;
export type WriteExercise = (typeof WRITE_EXERCISES)[number];

/** Sentence building needs at least three words to be an exercise. */
export function isBuildableLine(ar: string): boolean {
  return ar.trim().split(/\s+/).length >= 3;
}

/** Translating DE→AR is graded against one model answer, so only short lines. */
export function isTranslatableLine(ar: string): boolean {
  return ar.trim().split(/\s+/).length <= 6;
}

/**
 * Stored item id of a writing task. Copying keeps the bare word id, so progress saved before
 * the exercises were split into steps still counts.
 */
export function writeItemId(exercise: WriteExercise, id: string): string {
  return exercise === 'abschreiben' ? id : `${exercise}:${id}`;
}

/** Word ids (copy, dictation, transliteration) and line ids (building, translation). */
export function writeTasks(
  dialogues: readonly Pick<Dialog, 'id' | 'zeilen'>[],
  wordIds: readonly string[]
): Record<WriteExercise, string[]> {
  const lines = dialogues.flatMap((d) =>
    d.zeilen.map((z, i) => ({ id: lineId(d.id, i), ar: z.ar }))
  );
  return {
    abschreiben: [...wordIds],
    diktat: [...wordIds],
    umschrift: [...wordIds],
    satzbau: lines.filter((l) => isBuildableLine(l.ar)).map((l) => l.id),
    uebersetzung: lines.filter((l) => isTranslatableLine(l.ar)).map((l) => l.id),
  };
}

/** All stored writing item ids of a set of tasks. */
export function writeItemIds(tasks: Record<WriteExercise, string[]>): string[] {
  return WRITE_EXERCISES.flatMap((ex) => tasks[ex].map((id) => writeItemId(ex, id)));
}

/**
 * Items per skill of one unit. Cloze tasks need the example sentences (loaded on demand):
 * `clozeIds` are the words that have one; without it the unit has no cloze items yet.
 */
export function unitPracticeItems(
  bundle: Pick<ContentBundle, 'dialoge' | 'vokabeln' | 'verben'> &
    Partial<Pick<ContentBundle, 'grammatik'>>,
  unit: number,
  clozeIds?: ReadonlySet<string>
): Record<PracticeSkill, string[]> {
  const dialogues = bundle.dialoge.filter((d) => d.einheit === unit);
  return {
    read: dialogues.map((d) => d.id),
    grammar: grammarItems(bundle.grammatik ?? [], unit),
    cloze: bundle.vokabeln
      .filter((v) => v.einheit === unit && clozeIds?.has(v.id))
      .map((v) => v.id),
    write: writeItemIds(
      writeTasks(
        dialogues,
        bundle.vokabeln.filter((v) => v.einheit === unit).map((v) => v.id)
      )
    ),
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

/** Quiz question ids of a unit's grammar points (optionally one section only). */
export function grammarItems(
  points: readonly Pick<GrammatikPunkt, 'einheit' | 'abschnitt' | 'fragen'>[],
  unit: number,
  section?: number
): string[] {
  return points
    .filter(
      (p) => p.einheit === unit && (section === undefined || p.abschnitt === section)
    )
    .flatMap((p) => p.fragen.map((q) => q.id));
}
