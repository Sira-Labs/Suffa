/**
 * Checks on a tutor answer before it counts (story 10.4, tech spec §7): Arabic written with
 * Arabic letters only, vocalisation matching the learner's setting, no religious rulings, not
 * empty. Pure functions, fixture-tested.
 */
import type { TashkilLevel } from './learner.js';

export type Flag = 'empty' | 'foreign_letters' | 'missing_tashkil' | 'ruling';

/** Persian/Urdu letters and forms that look Arabic but are not MSA spelling. */
const FOREIGN = /[پچژگکیۀەۓے]/;
const HARAKA = /[ً-ْ]/;
const ARABIC_WORD = /[ء-يٱ][ء-ْٰٱ]+/g;
// A judgement, not the word itself: "Ich gebe keine Fatwas" is fine, "X ist haram" is not.
const RULING = [
  /\b(ist|is|sind|are)\s+(nicht\s+|not\s+)?(ḥ|h)ar[aā]m(?!\p{L})/iu,
  /\b(ist|is|sind|are)\s+(nicht\s+|not\s+)?(ḥ|h)al[aā]l(?!\p{L})/iu,
];

/** Share of Arabic words (2+ letters) that carry at least one vowel mark. */
export function tashkilCoverage(text: string): { words: number; share: number } {
  const words = text.match(ARABIC_WORD) ?? [];
  if (words.length === 0) return { words: 0, share: 1 };
  const marked = words.filter((w) => HARAKA.test(w)).length;
  return { words: words.length, share: marked / words.length };
}

export function validateAnswer(text: string, level: TashkilLevel): Flag[] {
  const flags: Flag[] = [];
  if (!text.trim()) return ['empty'];
  if (FOREIGN.test(text)) flags.push('foreign_letters');
  if (level === 'full') {
    const { words, share } = tashkilCoverage(text);
    // A few bare function words are tolerable; a mostly bare answer is not.
    if (words >= 3 && share < 0.6) flags.push('missing_tashkil');
  }
  if (RULING.some((r) => r.test(text))) flags.push('ruling');
  return flags;
}

/** The instruction for the one repair attempt. */
export function repairInstruction(flags: Flag[], language: 'de' | 'en'): string {
  const fixes: Record<Flag, string> = {
    empty: 'The answer was empty: answer the question.',
    foreign_letters:
      'Use Arabic letters only (ي not ی, ك not ک, no Persian or Urdu letters).',
    missing_tashkil: 'Vocalise every Arabic word fully.',
    ruling:
      'Do not give a religious ruling; explain the language question only and point to a teacher or scholar for rulings.',
  };
  return `[Check] Your last answer needs a fix. ${flags.map((f) => fixes[f]).join(' ')} Write the complete corrected answer again, in ${language === 'en' ? 'English' : 'German'} as before, without mentioning this check.`;
}

/** Flags that make an answer unfit to show even after the repair. */
export const BLOCKING: ReadonlySet<Flag> = new Set<Flag>([
  'empty',
  'ruling',
  'foreign_letters',
]);

export function fallbackMessage(language: 'de' | 'en'): string {
  return language === 'en'
    ? 'I am not sure I can answer that well. Please ask your teacher – or try asking a bit differently.'
    : 'Da bin ich mir nicht sicher genug. Frag am besten deine Lehrkraft – oder stell die Frage etwas anders.';
}
