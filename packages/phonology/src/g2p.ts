/**
 * Grapheme-to-phoneme conversion for vocalised Modern Standard Arabic (ADR-0022).
 *
 * Suffa's texts are (almost) fully vocalised, and vocalised MSA is close to phonemic, so the
 * expected sounds follow from rules: shadda doubles a consonant, the article's lam assimilates
 * to sun letters, hamzat al-waṣl is spoken only at the start of a phrase, tanwīn adds -n,
 * tāʾ marbūṭa is -t in connected speech and -h in pause, alif / wāw / yāʾ after the matching
 * vowel lengthen it. Every sound keeps the index of the letter it comes from, so feedback can
 * mark the exact letter.
 *
 * The book texts leave out vowels that are obvious to a reader (a fatḥa before alif, a ḍamma
 * before a lengthening wāw); these are filled in from the following letter.
 */
import {
  ALIF,
  ALIF_MADDA,
  ALIF_MAQSURA,
  ALIF_WASLA,
  CONSONANTS,
  DAGGER_ALIF,
  PAUSE_MARKS,
  SHADDA,
  SILENT_MARKS,
  SPACES,
  SUKUN,
  SUN_LETTERS,
  TANWIN_MARKS,
  TATWEEL,
  TA_MARBUTA,
  VOWEL_MARKS,
  WAW,
  YA,
  type ShortVowel,
} from './letters.js';

export interface Phone {
  /** IPA symbol; a doubled consonant or long vowel ends in "ː". */
  ipa: string;
  kind: 'consonant' | 'vowel';
  /** Index in the input text of the letter this sound comes from. */
  letter: number;
  /** Index of the word (in `words`) the sound belongs to. */
  word: number;
}

export interface Word {
  text: string;
  /** Start and end (exclusive) index in the input text. */
  start: number;
  end: number;
}

export interface Transcription {
  phones: Phone[];
  words: Word[];
  /** The phones as one IPA string, words separated by spaces. */
  ipa: string;
}

export interface G2pOptions {
  /**
   * Pausal forms at the end of each phrase (before . ، ؟ ! and at the end): the final short
   * vowel and tanwīn fall away, -an becomes -ā, tāʾ marbūṭa becomes -h. Default true, the way
   * a teacher reads a sentence aloud.
   */
  pause?: boolean;
}

/** The text holds a character the rules do not cover, or a mark without a letter. */
export class G2pError extends Error {
  constructor(
    message: string,
    readonly index: number
  ) {
    super(`${message} at index ${index}`);
    this.name = 'G2pError';
  }
}

interface Unit {
  ch: string;
  index: number;
  vowel: ShortVowel | null;
  tanwin: ShortVowel | null;
  sukun: boolean;
  shadda: boolean;
}

interface ParsedWord {
  units: Unit[];
  start: number;
  end: number;
}

const PREFIXES: ReadonlySet<string> = new Set(['و', 'ف', 'ب', 'ك']);
const LONG: Record<ShortVowel, string> = { a: 'aː', i: 'iː', u: 'uː' };

function isAlif(ch: string | undefined): boolean {
  return ch === ALIF || ch === ALIF_WASLA;
}

/** Splits the text into phrases of words of letters, the marks attached to their letter. */
function parse(text: string): ParsedWord[][] {
  const phrases: ParsedWord[][] = [];
  let phrase: ParsedWord[] = [];
  let word: ParsedWord | null = null;

  const endWord = () => {
    if (word) phrase.push(word);
    word = null;
  };
  const endPhrase = () => {
    endWord();
    if (phrase.length > 0) phrases.push(phrase);
    phrase = [];
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (SPACES.has(ch)) {
      endWord();
    } else if (PAUSE_MARKS.has(ch)) {
      endPhrase();
    } else if (SILENT_MARKS.has(ch) || ch === TATWEEL) {
      continue;
    } else if (ch in VOWEL_MARKS || ch in TANWIN_MARKS || ch === SUKUN || ch === SHADDA) {
      const current = word as ParsedWord | null;
      const unit = current?.units.at(-1);
      if (!unit) throw new G2pError('Mark without a letter', i);
      if (ch in VOWEL_MARKS) unit.vowel = VOWEL_MARKS[ch]!;
      else if (ch in TANWIN_MARKS) unit.tanwin = TANWIN_MARKS[ch]!;
      else if (ch === SUKUN) unit.sukun = true;
      else unit.shadda = true;
      current!.end = i + 1;
    } else if (
      ch in CONSONANTS ||
      isAlif(ch) ||
      ch === ALIF_MADDA ||
      ch === ALIF_MAQSURA ||
      ch === DAGGER_ALIF
    ) {
      // The dagger alif sits on a letter, like a vowel mark.
      if (ch === DAGGER_ALIF && !word) throw new G2pError('Mark without a letter', i);
      word ??= { units: [], start: i, end: i };
      word.units.push({
        ch,
        index: i,
        vowel: null,
        tanwin: null,
        sukun: false,
        shadda: false,
      });
      word.end = i + 1;
    } else {
      throw new G2pError(`Unsupported character "${ch}"`, i);
    }
  }
  endPhrase();
  return phrases;
}

/** Where the article sits in a word: its alif (if written) and its lam. */
function findArticle(units: Unit[]): { alif: number; lam: number } | null {
  const [a, b, c] = units;
  if (isAlif(a?.ch) && b?.ch === 'ل' && !b.vowel && !b.shadda && units.length > 2) {
    return { alif: 0, lam: 1 };
  }
  if (
    PREFIXES.has(units[0]!.ch) &&
    isAlif(b?.ch) &&
    c?.ch === 'ل' &&
    !c.vowel &&
    units.length > 3
  ) {
    return { alif: 1, lam: 2 };
  }
  // li- + al- is written without the alif: لِلْبَيْتِ.
  if (a?.ch === 'ل' && b?.ch === 'ل' && !b.vowel && !b.shadda && units.length > 2) {
    return { alif: -1, lam: 1 };
  }
  return null;
}

/** The vowel of hamzat al-waṣl when a phrase starts with it. */
function waslVowel(units: Unit[]): ShortVowel {
  const [first, second, third] = units;
  if (first?.vowel) return first.vowel;
  if (second?.ch === 'ل') return 'a';
  // Imperatives of u-verbs: اُكْتُبْ.
  return third?.vowel === 'u' ? 'u' : 'i';
}

/** The vowel a letter is read with: its mark, or the one the following letter implies. */
function vowelOf(
  unit: Unit,
  next: Unit | undefined,
  position: number
): ShortVowel | null {
  if (unit.vowel) return unit.vowel;
  if (unit.sukun || unit.tanwin) return null;
  if (next && !next.vowel && !next.tanwin && !next.shadda) {
    if (isAlif(next.ch) || next.ch === ALIF_MAQSURA || next.ch === DAGGER_ALIF)
      return 'a';
    if (next.ch === WAW) return 'u';
    if (next.ch === YA) return 'i';
    if (next.ch === TA_MARBUTA) return 'a';
  }
  if (unit.ch === 'إ') return 'i';
  if (unit.ch === 'أ' && position === 0) return 'a';
  return null;
}

/**
 * Whether `next` lengthens the vowel `vowel` (rather than being a consonant). A wāw or yāʾ
 * before a bare alif carries that alif's vowel itself (رِيال is ri-yāl), so it is a consonant;
 * not so the plural wāw with its silent final alif (كَتَبُوا).
 */
function lengthens(
  vowel: ShortVowel,
  next: Unit | undefined,
  after: Unit | undefined,
  afterIsFinal: boolean
): boolean {
  if (!next || next.vowel || next.tanwin || next.shadda) return false;
  if (vowel === 'a') {
    return isAlif(next.ch) || next.ch === ALIF_MAQSURA || next.ch === DAGGER_ALIF;
  }
  if (after && isAlif(after.ch) && !after.tanwin && !(vowel === 'u' && afterIsFinal)) {
    return false;
  }
  return vowel === 'u' ? next.ch === WAW : next.ch === YA;
}

/** Allāh written without the dagger alif (اللهُ, لِلّهِ, وَاللهِ): its last lam is long. */
function allahLam(units: Unit[]): number {
  const letters = units.map((u) => u.ch).join('');
  return /^(?:[وفبت]?ال|ل)له$/.test(letters) ? units.length - 2 : -1;
}

interface WordContext {
  wordIndex: number;
  phraseInitial: boolean;
  pausal: boolean;
  /** Letter index and text of the previous word when it ends in a consonant. */
  previousConsonantEnd: { letter: number; text: string } | null;
}

function wordPhones(units: Unit[], ctx: WordContext): Phone[] {
  const phones: Phone[] = [];
  const article = findArticle(units);
  const allah = allahLam(units);
  const lengthened = new Set<number>();
  const geminate = new Set<number>();
  /** Alif after tanwīn al-fatḥ (كِتاباً): silent, or -ā in pause. */
  const tanwinAlif = new Set<number>();
  const last = units.length - 1;

  const push = (ipa: string, kind: Phone['kind'], letter: number) =>
    phones.push({ ipa, kind, letter, word: ctx.wordIndex });
  const vowel = (ipa: string, letter: number) => push(ipa, 'vowel', letter);
  const pausalEnd = (k: number) => ctx.pausal && k === last;

  for (let k = 0; k < units.length; k++) {
    const unit = units[k]!;
    const next = units[k + 1];
    const { ch, index } = unit;

    if (lengthened.has(k)) {
      vowel(LONG[ch === WAW ? 'u' : ch === YA ? 'i' : 'a'], index);
      continue;
    }

    if (isAlif(ch)) {
      if (k === 0 || k === article?.alif) {
        // Hamzat al-waṣl: spoken only where a phrase starts.
        if (k === 0 && ctx.phraseInitial) {
          push('ʔ', 'consonant', index);
          vowel(waslVowel(units), index);
        } else if (k === 0 && ctx.previousConsonantEnd) {
          // A helper vowel joins the words: -a after مِنْ before the article, else -i.
          const { letter, text } = ctx.previousConsonantEnd;
          phones.push({
            ipa: text === 'من' && article ? 'a' : 'i',
            kind: 'vowel',
            letter,
            word: ctx.wordIndex - 1,
          });
        }
      } else if (tanwinAlif.has(k)) {
        if (pausalEnd(k)) vowel('aː', index);
      } else if (unit.tanwin === 'a') {
        if (pausalEnd(k)) vowel('aː', index);
        else {
          vowel('a', index);
          push('n', 'consonant', index);
        }
      }
      // Any other alif is written but silent: after the plural wāw (كَتَبُوا), in مِائَة.
      continue;
    }

    if (ch === ALIF_MADDA) {
      push('ʔ', 'consonant', index);
      vowel('aː', index);
      continue;
    }

    if (ch === DAGGER_ALIF) {
      // Spoken through its consonant (هٰذا, handled as a lengthening letter above); after a
      // written alif or alif maqṣūra (عَلىٰ) it only repeats the long vowel.
      continue;
    }

    if (ch === ALIF_MAQSURA) {
      if (unit.tanwin && !pausalEnd(k)) {
        vowel('a', index);
        push('n', 'consonant', index);
      } else {
        vowel('aː', index);
      }
      continue;
    }

    // A consonant letter.
    if (k === article?.lam) {
      if (next && SUN_LETTERS.has(next.ch)) geminate.add(k + 1);
      else push('l', 'consonant', index);
      continue;
    }

    if (ch === TA_MARBUTA && pausalEnd(k)) {
      push('h', 'consonant', index);
      continue;
    }

    const base = CONSONANTS[ch]!;
    push(unit.shadda || geminate.has(k) ? `${base}ː` : base, 'consonant', index);

    if (k === allah) {
      vowel('aː', index);
      continue;
    }

    const v = vowelOf(unit, next, k);
    // The article's alif after a prefix (وَالْ…) is silent, it does not lengthen.
    if (
      v &&
      lengthens(v, next, units[k + 2], k + 2 === last) &&
      k + 1 !== article?.alif
    ) {
      lengthened.add(k + 1);
    } else if (unit.tanwin) {
      if (unit.tanwin === 'a' && next && isAlif(next.ch)) {
        tanwinAlif.add(k + 1);
        if (!(ctx.pausal && k + 1 === last)) {
          vowel('a', index);
          push('n', 'consonant', index);
        }
      } else if (pausalEnd(k)) {
        if (unit.tanwin === 'a') vowel('aː', index);
      } else {
        vowel(unit.tanwin, index);
        push('n', 'consonant', index);
      }
    } else if (v && !pausalEnd(k)) {
      vowel(v, index);
    }
  }
  return phones;
}

/**
 * Converts vocalised Arabic text to phones, each pointing back at its letter.
 *
 * @throws G2pError for a character outside Arabic letters, marks and punctuation.
 */
export function g2p(text: string, options: G2pOptions = {}): Transcription {
  const pause = options.pause ?? true;
  const phones: Phone[] = [];
  const words: Word[] = [];

  for (const phrase of parse(text)) {
    let previousConsonantEnd: WordContext['previousConsonantEnd'] = null;
    phrase.forEach((parsed, i) => {
      const wordIndex = words.length;
      words.push({
        text: text.slice(parsed.start, parsed.end),
        start: parsed.start,
        end: parsed.end,
      });
      const own = wordPhones(parsed.units, {
        wordIndex,
        phraseInitial: i === 0,
        pausal: pause && i === phrase.length - 1,
        previousConsonantEnd,
      });
      phones.push(...own);
      const tail = own.at(-1);
      previousConsonantEnd =
        tail?.kind === 'consonant'
          ? { letter: tail.letter, text: parsed.units.map((u) => u.ch).join('') }
          : null;
    });
  }

  const ipa = words
    .map((_, w) =>
      phones
        .filter((p) => p.word === w)
        .map((p) => p.ipa)
        .join('')
    )
    .filter(Boolean)
    .join(' ');
  return { phones, words, ipa };
}

/** The IPA string of a vocalised Arabic text (see `g2p`). */
export function toIpa(text: string, options?: G2pOptions): string {
  return g2p(text, options).ipa;
}
