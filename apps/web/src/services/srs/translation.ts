/**
 * Tolerant grading of translations typed in the learner's meaning language: German or
 * English (story 16.4, ADR-0021), Turkish, Italian, Bosnian or Albanian (18.4, ADR-0033).
 *
 * Content glosses list several meanings in one string, e.g. „Land, Ort“,
 * „Friede; Begrüßung“, „Ägypten / Ägypter(in)“ or „das Gute; (mir geht es) gut“.
 * A learner who types any one of them (or several) is right. The matcher
 *  1. splits a gloss into alternative meanings (not for full sentences),
 *  2. expands optional parts in parentheses („Ägypter(in)“ → Ägypter, Ägypterin),
 *  3. normalises case, umlauts/ß, diacritics, punctuation, leading articles and (English)
 *     British/American spellings,
 *  4. forgives small typos (Damerau-Levenshtein, scaled by word length).
 */

export type TranslationVerdict = 'exact' | 'accepted' | 'typo' | 'wrong';

export interface TranslationGrade {
  verdict: TranslationVerdict;
  /** Meanings (display form) the learner hit. */
  matched: string[];
  /** All meanings of the gloss (display form), e.g. to show „Also correct: …“. */
  meanings: string[];
}

/** The language a gloss and the typed answer are in (stories 16.4 and 18.4). */
export type TranslationLocale = 'de' | 'en' | 'tr' | 'it' | 'bs' | 'sq';

/**
 * Per-locale normalisation (ADR-0021): leading words ignored when comparing (articles,
 * reflexive and infinitive markers) and spelling variants folded to one form. Both the
 * gloss and the answer pass the same rules, so a broad rule only merges spellings.
 *
 * Leading words are compared after folding (lower case, no diacritics), so they are listed
 * in that form. Letters with diacritics need no rule: ş, ç, ğ, č, ć, š, ž, ë, à, è fold to
 * their base letter for every locale, so an answer typed on another keyboard matches. Only
 * letters that are no base letter plus a mark get a spelling rule.
 */
interface LocaleRules {
  leading: ReadonlySet<string>;
  /**
   * Pattern, its replacement, and optionally a looser replacement used for the second,
   * mark-less comparison (`umlautAsBase`): a letter typed the plainest way.
   */
  spelling: readonly (readonly [RegExp, string, string?])[];
  /**
   * ä, ö, ü are written ae, oe, ue where the keyboard lacks them (German). Elsewhere they
   * fold to a, o, u like any letter with a mark: Turkish „göz“ is three letters, and
   * „gozluk“ is „gözlük“ without a typo.
   */
  umlautDigraphs: boolean;
}

const LOCALE_RULES: Record<TranslationLocale, LocaleRules> = {
  de: {
    umlautDigraphs: true,
    // English articles stay ignored too: German glosses were matched like this before 16.4.
    leading: new Set([
      'der',
      'die',
      'das',
      'den',
      'dem',
      'des',
      'ein',
      'eine',
      'einen',
      'einem',
      'einer',
      'eines',
      'sich',
      'zu',
      'the',
      'a',
      'an',
      'to',
    ]),
    spelling: [],
  },
  en: {
    // As before 18.4: English glosses were always folded like German ones.
    umlautDigraphs: true,
    leading: new Set(['the', 'a', 'an', 'to']),
    // British and American spellings: colour/color, centre/center, organise/organize,
    // travelling/traveling, grey/gray.
    spelling: [
      [/\b(\p{L}{3,})our\b/gu, '$1or'],
      [/\b(\p{L}{3,})tre\b/gu, '$1ter'],
      [/\b(\p{L}{3,})is(e|ed|es|ing|ation)\b/gu, '$1iz$2'],
      [/\b(\p{L}{2,}[aeiou])ll(ed|ing|er)\b/gu, '$1l$2'],
      [/\bgrey\b/gu, 'gray'],
    ],
  },
  tr: {
    umlautDigraphs: false,
    // No articles; "bir" (a, one) before a noun is left out by most learners.
    leading: new Set(['bir']),
    // The dotless ı is its own letter: typed as i on keyboards without it. (A capital İ
    // becomes i plus a mark when lower-cased and folds like any diacritic.)
    spelling: [[/ı/gu, 'i']],
  },
  it: {
    umlautDigraphs: false,
    // Articles, also the elided ones: "l'amico" reaches here as "l amico".
    leading: new Set(['il', 'lo', 'la', 'l', 'i', 'gli', 'le', 'un', 'uno', 'una']),
    spelling: [],
  },
  bs: {
    umlautDigraphs: false,
    // No articles. đ is its own letter: written dj where the keyboard lacks it, or just d.
    leading: new Set([]),
    spelling: [[/đ/gu, 'dj', 'd']],
  },
  sq: {
    umlautDigraphs: false,
    // Only "një" (a). The linking articles (i, e, të, së) are not ignored: "e hënë" is
    // Monday and "hënë" the moon. A gloss that allows both writes "(i) mirë".
    leading: new Set(['nje']),
    spelling: [],
  },
};

/** Separators between alternative meanings inside one gloss. */
const ALTERNATIVE_SEPARATOR = /\s*[;,/]\s*/;
/** Editorial notes after a spaced dash are not part of the meaning („… – Plural gebrochen!“). */
const NOTE_SEPARATOR = /\s+[–—-]\s+/;
/** A gloss ending like a sentence is compared as a whole, never split at commas. */
const SENTENCE_END = /[.?!]\s*$/;

/**
 * Lower-case, fold umlauts/ß and other diacritics, drop punctuation and leading articles.
 * Umlauts fold to „ae/oe/ue“ by default; `umlautAsBase` folds them to „a/o/u“ instead, so
 * both spellings typed on keyboards without umlauts („Nationalitaet“, „Nationalitat“) match.
 */
export function normalizeTranslation(
  input: string,
  umlautAsBase = false,
  locale: TranslationLocale = 'de'
): string {
  const rules = LOCALE_RULES[locale];
  let folded = input.toLowerCase();
  if (rules.umlautDigraphs && !umlautAsBase) {
    folded = folded.replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue');
  }
  folded = folded
    .replace(/ß/g, 'ss')
    .normalize('NFKD')
    .replace(/\p{M}/gu, '') // remaining combining marks (ī → i, é → e)
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  for (const [pattern, replacement, loose] of rules.spelling) {
    folded = folded.replace(pattern, umlautAsBase ? (loose ?? replacement) : replacement);
  }
  const words = folded.split(' ');
  while (words.length > 1 && rules.leading.has(words[0]!)) words.shift();
  return words.join(' ');
}

/**
 * Expands optional parenthesised parts of one meaning into accepted variants:
 * „Ägypter(in)“ → [Ägypter, Ägypterin]; „(mir geht es) gut“ → [gut, mir geht es gut];
 * „Türke (Türkin)“ → [Türke, Türke Türkin, Türkin] (a trailing group is also an alternative).
 */
export function expandOptionalParts(meaning: string): string[] {
  const without = meaning.replace(/\s*\([^)]*\)\s*/g, ' ').trim();
  const withContent = meaning.replace(/\(([^)]*)\)/g, '$1').trim();
  const variants = new Set([without, withContent].filter(Boolean));
  const trailing = /\s\(([^)]+)\)\s*$/.exec(meaning);
  if (trailing?.[1]) variants.add(trailing[1].trim());
  return [...variants];
}

/** Splits a gloss into its meanings (display form). Sentences stay whole. */
export function splitMeanings(gloss: string): string[] {
  const main = gloss.split(NOTE_SEPARATOR)[0]!.trim();
  if (SENTENCE_END.test(main)) return [main];
  return main
    .split(ALTERNATIVE_SEPARATOR)
    .map((m) => m.trim())
    .filter(Boolean);
}

/** Optimal-string-alignment distance (Levenshtein + adjacent transpositions). */
export function editDistance(a: string, b: string): number {
  const n = a.length;
  const m = b.length;
  if (n === 0) return m;
  if (m === 0) return n;
  const d: number[][] = Array.from({ length: n + 1 }, (_, i) =>
    Array.from({ length: m + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let best = Math.min(d[i - 1]![j]! + 1, d[i]![j - 1]! + 1, d[i - 1]![j - 1]! + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        best = Math.min(best, d[i - 2]![j - 2]! + 1);
      }
      d[i]![j] = best;
    }
  }
  return d[n]![m]!;
}

/** Typos forgiven for a target of this length: none below 4 letters, then 1, from 9 letters 2. */
export function allowedTypos(target: string): number {
  const len = target.replace(/\s/g, '').length;
  if (len < 4) return 0;
  return len < 9 ? 1 : 2;
}

type PartMatch = { meaning: string; exact: boolean } | null;

function matchPart(
  part: string,
  meanings: string[],
  locale: TranslationLocale
): PartMatch {
  const normalizedPart = normalizeTranslation(part, false, locale);
  if (!normalizedPart) return null;
  let typoMatch: PartMatch = null;
  for (const meaning of meanings) {
    for (const variant of expandOptionalParts(meaning)) {
      const target = normalizeTranslation(variant, false, locale);
      if (!target) continue;
      if (
        target === normalizedPart ||
        normalizeTranslation(variant, true, locale) ===
          normalizeTranslation(part, true, locale)
      ) {
        return { meaning, exact: true };
      }
      if (!typoMatch && editDistance(normalizedPart, target) <= allowedTypos(target)) {
        typoMatch = { meaning, exact: false };
      }
    }
  }
  return typoMatch;
}

/**
 * Grades a typed translation against a gloss. Every part the learner typed (split like
 * the gloss) must match one meaning; one correct meaning is enough.
 */
export function gradeTranslation(
  input: string,
  gloss: string,
  locale: TranslationLocale = 'de'
): TranslationGrade {
  const meanings = splitMeanings(gloss);
  const wrong: TranslationGrade = { verdict: 'wrong', matched: [], meanings };
  const normalizedInput = normalizeTranslation(input, false, locale);
  if (!normalizedInput) return wrong;
  if (
    normalizedInput ===
    normalizeTranslation(gloss.split(NOTE_SEPARATOR)[0]!, false, locale)
  ) {
    return { verdict: 'exact', matched: meanings, meanings };
  }

  const parts = SENTENCE_END.test(gloss) ? [input] : input.split(ALTERNATIVE_SEPARATOR);
  const matches = parts
    .filter((p) => p.trim())
    .map((p) => matchPart(p, meanings, locale));
  if (matches.length === 0 || matches.some((m) => m === null)) return wrong;

  const matched = [...new Set(matches.map((m) => m!.meaning))];
  const allExact = matches.every((m) => m!.exact);
  if (allExact && matched.length === meanings.length) {
    return { verdict: 'exact', matched, meanings };
  }
  return { verdict: allExact ? 'accepted' : 'typo', matched, meanings };
}
