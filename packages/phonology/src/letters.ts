/**
 * Character tables for vocalised Modern Standard Arabic: the consonant each letter stands
 * for (IPA), the vowel marks, and the characters that only separate words or phrases.
 */

export type ShortVowel = 'a' | 'i' | 'u';

/** Consonant letters and their IPA sound. Hamza seats all stand for the glottal stop. */
export const CONSONANTS: Readonly<Record<string, string>> = {
  ء: 'ʔ',
  أ: 'ʔ',
  إ: 'ʔ',
  ؤ: 'ʔ',
  ئ: 'ʔ',
  ب: 'b',
  ت: 't',
  ة: 't',
  ث: 'θ',
  ج: 'dʒ',
  ح: 'ħ',
  خ: 'x',
  د: 'd',
  ذ: 'ð',
  ر: 'r',
  ز: 'z',
  س: 's',
  ش: 'ʃ',
  ص: 'sˤ',
  ض: 'dˤ',
  ط: 'tˤ',
  ظ: 'ðˤ',
  ع: 'ʕ',
  غ: 'ɣ',
  ف: 'f',
  ق: 'q',
  ك: 'k',
  ل: 'l',
  م: 'm',
  ن: 'n',
  ه: 'h',
  و: 'w',
  ي: 'j',
};

/** Letters the article's lam assimilates to ("sun letters"). */
export const SUN_LETTERS: ReadonlySet<string> = new Set([
  'ت',
  'ث',
  'د',
  'ذ',
  'ر',
  'ز',
  'س',
  'ش',
  'ص',
  'ض',
  'ط',
  'ظ',
  'ل',
  'ن',
]);

/** Plain alif, and the explicit hamzat al-waṣl sign. */
export const ALIF = 'ا';
export const ALIF_WASLA = 'ٱ';
export const ALIF_MADDA = 'آ';
export const ALIF_MAQSURA = 'ى';
export const DAGGER_ALIF = 'ٰ';
export const TA_MARBUTA = 'ة';
export const WAW = 'و';
export const YA = 'ي';

export const FATHA = 'َ';
export const KASRA = 'ِ';
export const DAMMA = 'ُ';
export const SUKUN = 'ْ';
export const SHADDA = 'ّ';
export const FATHATAN = 'ً';
export const KASRATAN = 'ٍ';
export const DAMMATAN = 'ٌ';

export const VOWEL_MARKS: Readonly<Record<string, ShortVowel>> = {
  [FATHA]: 'a',
  [KASRA]: 'i',
  [DAMMA]: 'u',
};

export const TANWIN_MARKS: Readonly<Record<string, ShortVowel>> = {
  [FATHATAN]: 'a',
  [KASRATAN]: 'i',
  [DAMMATAN]: 'u',
};

/** Ignored: the elongation stroke (tatwīl). */
export const TATWEEL = 'ـ';

/** Punctuation that ends a phrase: the reader pauses there. */
export const PAUSE_MARKS: ReadonlySet<string> = new Set([
  '.',
  '،',
  ',',
  '؟',
  '?',
  '!',
  '؛',
  ';',
  ':',
  '…',
  '–',
  '—',
  '-',
  // Gaps in exercises (___), arrows (كِتابٌ ← الْكِتابُ) and alternatives (بِلاد / بُلْدان)
  // separate like a pause.
  '_',
  '/',
  '←',
  '→',
]);

/** Separates words without a pause. */
export const SPACES: ReadonlySet<string> = new Set([' ', '\u00a0', '\t', '\n']);

/** Quotes and brackets carry no sound and no pause. */
export const SILENT_MARKS: ReadonlySet<string> = new Set([
  '"',
  '«',
  '»',
  '(',
  ')',
  '“',
  '”',
]);
