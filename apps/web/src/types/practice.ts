import type { Syncable } from './srs';

/** Skills practised inside a unit, besides listening and vocabulary cards. */
export type PracticeSkill = 'read' | 'grammar' | 'cloze' | 'write' | 'speak' | 'verbs';

/**
 * One practised item of a unit skill (a dialogue read, a word written correctly, a dialogue
 * line spoken, a verb drilled correctly). Only the first success per item is stored; XP and
 * station progress are derived from these records. Local for now, like media_progress.
 */
export interface PracticeRecord extends Syncable {
  /** `${unit}:${skill}:${itemId}` */
  id: string;
  unit: number;
  skill: PracticeSkill;
  /** Content id: dialogue id, vocabulary id, `${dialogId}#${line}` or verb id. */
  itemId: string;
  practisedAt: string;
}

/** A skill module opened inside a unit: only that unit's content, successes reported. */
export interface UnitPracticeScope {
  unit: number;
  /** Inside a section: only these dialogues (reading, speaking, sentence exercises). */
  dialogIds?: readonly string[];
  /** Inside a section: only these words (writing). */
  wordIds?: readonly string[];
  /** Has this item been done before? Lets a module continue where the learner left off. */
  isPractised?(itemId: string): boolean;
  /** Called with the item id after a successful answer or finished item. */
  onPractised(itemId: string): void;
}
