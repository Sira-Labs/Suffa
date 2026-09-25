/**
 * Tap-to-gloss for video transcripts (story 12.3): a word of the transcript → the course word
 * (vowels, letter variants, the article and a leading و/ف/ب/ل/ك ignored). Offline, from the
 * bundled content.
 */
import { content } from '@/content';
import { normalizeArabic } from '@/services/srs/tashkil';
import type { Vokabel } from '@/types';

let index: Map<string, Vokabel> | null = null;

function lookupIndex(): Map<string, Vokabel> {
  if (!index) {
    index = new Map();
    for (const v of content.vokabeln) {
      const key = normalizeArabic(v.ar);
      if (!index.has(key)) index.set(key, v);
      if (v.plural) {
        const plural = normalizeArabic(v.plural);
        if (!index.has(plural)) index.set(plural, v);
      }
    }
  }
  return index;
}

export function glossFor(word: string): Vokabel | null {
  const clean = normalizeArabic(word.replace(/[^؀-ۿ]/g, ''));
  if (!clean) return null;
  const words = lookupIndex();
  for (const candidate of [
    clean,
    clean.replace(/^ال/, ''),
    clean.replace(/^[وفبلك]ال/, ''),
    clean.replace(/^[وف]/, ''),
  ]) {
    const hit = words.get(candidate);
    if (hit) return hit;
  }
  return null;
}
