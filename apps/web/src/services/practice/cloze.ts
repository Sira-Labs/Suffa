/**
 * Cloze tasks ("Lückentext") from the example sentences: the word is blanked out of a real
 * sentence and the learner picks it from four words of the unit. Pure, so the unit path can
 * count the tasks and the station can show them from the same rule.
 */
import type { ExampleSentence, Vokabel } from '@/types';
import { normalizeArabic } from '@/services/srs/tashkil';
import { tokenStems } from './sections';

export interface ClozeTask {
  wordId: string;
  /** Sentence text before and after the blank (punctuation stays in place). */
  before: string;
  after: string;
  /** The blanked form as it stands in the sentence (vocalised). */
  gap: string;
  de: string;
}

/** Choices per task: the word plus three distractors. */
export const CLOZE_CHOICES = 4;

const isLetter = (code: number) => code >= 0x0621 && code <= 0x064a;
/** Harakāt, tanwīn, shadda, sukūn and the dagger alif belong to the word. */
const isMark = (code: number) => (code >= 0x064b && code <= 0x0652) || code === 0x0670;

/** Leading non-letters, the word with its marks, trailing punctuation. */
function splitPunctuation(part: string): { lead: string; core: string; trail: string } {
  let start = 0;
  while (start < part.length && !isLetter(part.charCodeAt(start))) start++;
  let end = part.length;
  while (end > start) {
    const code = part.charCodeAt(end - 1);
    if (isLetter(code) || isMark(code)) break;
    end--;
  }
  return {
    lead: part.slice(0, start),
    core: part.slice(start, end),
    trail: part.slice(end),
  };
}

function bareLemma(word: string): string {
  const lemma = normalizeArabic(word);
  return lemma.startsWith('ال') && lemma.length > 3 ? lemma.slice(2) : lemma;
}

/** The first example in which a single-word entry occurs, with that token blanked. */
export function clozeFor(
  word: Pick<Vokabel, 'id' | 'ar'>,
  examples: readonly ExampleSentence[]
): ClozeTask | null {
  const bare = bareLemma(word.ar);
  // Phrases would need several blanks; they are practised elsewhere.
  if (/\s/.test(bare)) return null;
  for (const example of examples) {
    const parts = example.ar.split(/(\s+)/);
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]!;
      // Keep punctuation outside the gap: «كِتابٌ؟» → « + كِتابٌ + ؟»
      const { lead, core, trail } = splitPunctuation(part);
      if (!core || !tokenStems(normalizeArabic(core)).has(bare)) continue;
      return {
        wordId: word.id,
        before: parts.slice(0, i).join('') + lead,
        gap: core,
        after: trail + parts.slice(i + 1).join(''),
        de: example.de,
      };
    }
  }
  return null;
}

/** Ids of the words that have a cloze task. */
export function clozeWordIds(
  words: readonly Pick<Vokabel, 'id' | 'ar'>[],
  examples: Readonly<Record<string, readonly ExampleSentence[]>>
): Set<string> {
  return new Set(
    words.filter((w) => clozeFor(w, examples[w.id] ?? []) !== null).map((w) => w.id)
  );
}

/**
 * The word and three distractors from `pool` (other words of the unit), in a stable order
 * per task so a reload does not reshuffle the answer.
 */
export function clozeChoices<W extends { id: string }>(word: W, pool: readonly W[]): W[] {
  const others = pool.filter((w) => w.id !== word.id);
  const rank = (w: W) => hash(`${word.id}|${w.id}`);
  const picks = [...others].sort((a, b) => rank(a) - rank(b)).slice(0, CLOZE_CHOICES - 1);
  return [...picks, word].sort((a, b) => rank(a) - rank(b));
}

/** A fixed order for `items` that depends on `seed` only (answers do not move on reload). */
export function stableShuffle<T>(
  items: readonly T[],
  seed: string,
  key: (item: T) => string
): T[] {
  return [...items].sort((a, b) => hash(`${seed}|${key(a)}`) - hash(`${seed}|${key(b)}`));
}

function hash(text: string): number {
  let h = 0;
  for (const ch of text) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h;
}
