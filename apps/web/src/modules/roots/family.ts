/**
 * Root families (design step 5): a root with every word built from it — the course's words
 * and verbs plus our own further derivations — and the patterns (awzān) that build them.
 * Pure functions, so the explorer and the pattern trainer share one source of truth.
 */
import type { Verb, Vokabel } from '@/types';
import familiesRaw from '@/content/roots/families.json';
import patternsRaw from '@/content/roots/patterns.json';

export interface Pattern {
  wazn: string;
  de: string;
  example: string;
  exampleDe: string;
}

export interface FamilyWord {
  /** Stable key (course id, or `x:<root>:<ar>` for our own derivations). */
  key: string;
  ar: string;
  de: string;
  wazn?: string;
  /** Where it comes from: a course word, a course verb, or our own derivation. */
  source: 'word' | 'verb' | 'extra';
  /** The learner has reached the unit that teaches it (always false for extras). */
  learned: boolean;
  /** Unit of the course that teaches it (none for extras). */
  unit?: number;
}

export interface RootFamily {
  /** Root as stored ("ك-ت-ب"). */
  root: string;
  letters: string[];
  words: FamilyWord[];
}

interface ExtraWord {
  ar: string;
  de: string;
  wazn?: string;
}

const EXTRAS = familiesRaw.families as Record<string, ExtraWord[]>;

export const PATTERNS: ReadonlyMap<string, Pattern> = new Map(
  (patternsRaw.patterns as Pattern[]).map((p) => [p.wazn, p])
);

/** A verb's wazn field reads "فَعَلَ يَفْعُلُ (…)"; its past-tense pattern is the first word. */
export function verbPattern(wazn: string): string {
  return wazn.split(/\s+/)[0] ?? wazn;
}

/** Same word regardless of the article and written sukūn (both vary between sources). */
function sameWord(a: string, b: string): boolean {
  const norm = (s: string) =>
    s
      .replace(/\u0652/g, '')
      .replace(/^ال/, '')
      .trim();
  return norm(a) === norm(b);
}

export function rootLetters(root: string): string[] {
  return root.split('-').filter(Boolean);
}

/**
 * One family from the course content and our extras. A course word that is also in our extras
 * stays the course word; the extra only adds its pattern where the course has none.
 */
export function buildFamily(
  root: string,
  vokabeln: readonly Vokabel[],
  verben: readonly Verb[],
  isLearned: (item: { einheit?: number }) => boolean
): RootFamily {
  const extras = EXTRAS[root] ?? [];
  const words: FamilyWord[] = [];
  for (const verb of verben) {
    words.push({
      key: verb.id,
      ar: verb.lemma,
      de: verb.de,
      wazn: verbPattern(verb.wazn),
      source: 'verb',
      learned: isLearned(verb),
      unit: verb.einheit,
    });
  }
  for (const v of vokabeln) {
    const extra = extras.find((e) => sameWord(e.ar, v.ar));
    words.push({
      key: v.id,
      ar: v.ar,
      de: v.de,
      wazn: v.wazn ?? extra?.wazn,
      source: 'word',
      learned: isLearned(v),
      unit: v.einheit,
    });
  }
  for (const e of extras) {
    if (words.some((w) => w.source === 'word' && sameWord(w.ar, e.ar))) continue;
    words.push({
      key: `x:${root}:${e.ar}`,
      ar: e.ar,
      de: e.de,
      wazn: e.wazn,
      source: 'extra',
      learned: false,
    });
  }
  // Learned words first, so the wheel starts with what the learner knows.
  words.sort((a, b) => Number(b.learned) - Number(a.learned));
  return { root, letters: rootLetters(root), words };
}

const HARAKAT = /[\u064B-\u065F\u0670]/;
const SHADDA = '\u0651';
const HAMZA_FORMS = 'أإآءؤئا';
const WEAK = 'وي';

function sameLetter(char: string, rootLetter: string): boolean {
  if (char === rootLetter) return true;
  const hamza = (c: string) => 'أإآءؤئ'.includes(c);
  return hamza(rootLetter) && HAMZA_FORMS.includes(char);
}

export interface Segment {
  text: string;
  root: boolean;
}

/**
 * Splits a word into runs of root letters and other letters, so the root can be coloured inside
 * the word. Each letter keeps its vowel signs. Root letters are matched in order; a weak root
 * letter (و ي) may show as ا or ى inside the word (قال from ق-و-ل), a letter with shadda may
 * stand for a doubled root letter (أَحَبَّ from ح-ب-ب), and the article is never part of the root.
 */
export function rootSegments(word: string, root: string): Segment[] {
  const letters = rootLetters(root);
  // Letters with their following vowel signs.
  const clusters: string[] = [];
  for (const ch of Array.from(word)) {
    if (HARAKAT.test(ch) && clusters.length) clusters[clusters.length - 1] += ch;
    else clusters.push(ch);
  }
  const articleEnd = /^ال/.test(word) && clusters.length > 3 ? 2 : 0;
  let next = 0;
  const marks = clusters.map((cluster, i) => {
    if (i < articleEnd || next >= letters.length) return false;
    const base = cluster[0]!;
    const want = letters[next]!;
    let hit = sameLetter(base, want);
    if (!hit && WEAK.includes(want) && next > 0 && 'اى'.includes(base)) hit = true;
    if (!hit && WEAK.includes(want) && next + 1 < letters.length) {
      // The weak letter dropped out of this form: match the letter after it.
      if (sameLetter(base, letters[next + 1]!)) {
        next += 1;
        hit = true;
      }
    }
    if (!hit) return false;
    next += 1;
    if (cluster.includes(SHADDA) && letters[next] === want) next += 1;
    return true;
  });
  const segments: Segment[] = [];
  clusters.forEach((cluster, i) => {
    const last = segments[segments.length - 1];
    if (last && last.root === marks[i]) last.text += cluster;
    else segments.push({ text: cluster, root: marks[i]! });
  });
  return segments;
}

/** Every word with a known pattern, for the pattern trainer and "same pattern" examples. */
export function patternWords(
  families: readonly RootFamily[]
): (FamilyWord & { root: string })[] {
  return families.flatMap((f) =>
    f.words
      .filter((w) => w.wazn !== undefined && PATTERNS.has(w.wazn))
      .map((w) => ({ ...w, root: f.root }))
  );
}

export interface PatternQuestion {
  answer: FamilyWord & { root: string };
  pattern: Pattern;
  /** The answer and up to three other words, shuffled. */
  options: (FamilyWord & { root: string })[];
}

/**
 * A pattern-trainer question: root + pattern → which word? Wrong options come first from the
 * same root (other patterns), then from the same pattern (other roots), so the learner has to
 * read both. Null when the pool has no word with a second option.
 */
export function makePatternQuestion(
  pool: readonly (FamilyWord & { root: string })[],
  random: () => number = Math.random
): PatternQuestion | null {
  const pick = <T>(items: readonly T[]): T | undefined =>
    items[Math.floor(random() * items.length)];
  const shuffle = <T>(items: T[]): T[] => {
    const out = [...items];
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [out[i], out[j]] = [out[j]!, out[i]!];
    }
    return out;
  };
  const candidates = pool.filter((w) =>
    pool.some((o) => o.ar !== w.ar && (o.root === w.root || o.wazn === w.wazn))
  );
  const answer = pick(candidates);
  if (!answer) return null;
  const sameRoot = pool.filter(
    (w) => w.root === answer.root && w.ar !== answer.ar && w.wazn !== answer.wazn
  );
  const samePattern = pool.filter(
    (w) => w.wazn === answer.wazn && w.root !== answer.root
  );
  const wrong: (FamilyWord & { root: string })[] = [];
  for (const w of [...shuffle(sameRoot), ...shuffle(samePattern)]) {
    if (wrong.length === 3) break;
    if (!wrong.some((o) => o.ar === w.ar)) wrong.push(w);
  }
  return {
    answer,
    pattern: PATTERNS.get(answer.wazn!)!,
    options: shuffle([answer, ...wrong]),
  };
}
