/**
 * A unit split into focused sections, one per own dialogue: the learner meets dialogue 1 with
 * its words first, then dialogue 2, and so on. Content-only and pure, so the unit path, the
 * station pages and the focus review agree on which items belong to a section.
 *
 * A word belongs to the first dialogue it appears in; words no dialogue uses are spread over
 * the sections so that every sitting stays about the same size.
 */
import type { ContentBundle } from '@/types';
import { normalizeArabic } from '@/services/srs/tashkil';
import { lineId } from './items';

export interface UnitSection {
  /** 1-based, equals the dialogue number within the unit. */
  no: number;
  dialogId: string;
  /** Dialogue title (Arabic). */
  title: string;
  wordIds: string[];
  /** Speaking items: the dialogue's lines. */
  lineIds: string[];
}

const PREFIXES = ['وال', 'فال', 'بال', 'كال', 'لل', 'ال', 'و', 'ف', 'ب', 'ل', 'ك'];
const SUFFIXES = [
  'هما',
  'كما',
  'هم',
  'هن',
  'كم',
  'كن',
  'نا',
  'ها',
  'ه',
  'ك',
  'ي',
  'ات',
  'ين',
  'ون',
  'ان',
];

/** Candidate stems of a normalized token: without clitic prefixes and suffixes. */
export function tokenStems(token: string): Set<string> {
  const out = new Set([token]);
  for (const p of PREFIXES) {
    if (token.startsWith(p) && token.length - p.length >= 2)
      out.add(token.slice(p.length));
  }
  for (const s of [...out]) {
    for (const suf of SUFFIXES) {
      if (s.endsWith(suf) && s.length - suf.length >= 2) out.add(s.slice(0, -suf.length));
    }
  }
  // Taa marbuta before a suffix is written ت: غرفتي → غرفت → غرفه
  for (const s of [...out]) {
    if (s.endsWith('ت') && s.length >= 3) out.add(`${s.slice(0, -1)}ه`);
  }
  return out;
}

function tokens(text: string): string[] {
  return normalizeArabic(text)
    .split(/[^ء-ي]+/)
    .filter(Boolean);
}

/** Does a vocabulary entry occur in a text? Phrases by substring, words by stem. */
export function wordOccurs(word: string, text: string): boolean {
  const lemma = normalizeArabic(word);
  const bare = lemma.startsWith('ال') && lemma.length > 3 ? lemma.slice(2) : lemma;
  if (/\s/.test(bare)) return normalizeArabic(text).includes(bare);
  return tokens(text).some((t) => tokenStems(t).has(bare));
}

export function dialogueSections(
  bundle: Pick<ContentBundle, 'dialoge' | 'vokabeln'>,
  unit: number
): UnitSection[] {
  const dialogues = bundle.dialoge
    .filter((d) => d.einheit === unit)
    .sort((a, b) => a.dialog - b.dialog);
  if (dialogues.length === 0) return [];
  const sections: UnitSection[] = dialogues.map((d, i) => ({
    no: i + 1,
    dialogId: d.id,
    title: d.titel,
    wordIds: [],
    lineIds: d.zeilen.map((_, line) => lineId(d.id, line)),
  }));
  const texts = dialogues.map((d) => d.zeilen.map((z) => z.ar).join(' '));
  const unplaced: string[] = [];
  for (const word of bundle.vokabeln.filter((v) => v.einheit === unit)) {
    const at = texts.findIndex((text) => wordOccurs(word.ar, text));
    if (at >= 0) sections[at]!.wordIds.push(word.id);
    else unplaced.push(word.id);
  }
  // Leftovers go to the currently smallest section (earlier sections win ties).
  for (const id of unplaced) {
    const smallest = sections.reduce((a, b) =>
      b.wordIds.length < a.wordIds.length ? b : a
    );
    smallest.wordIds.push(id);
  }
  return sections;
}
