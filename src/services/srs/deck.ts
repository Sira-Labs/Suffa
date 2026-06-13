/**
 * Deck-Builder: leitet aus den statischen Lehrinhalten die zu lernenden
 * SRS-Karten ab. Eine Karte = (contentRef, kind).
 *
 * Die Karten-ID ist DETERMINISTISCH (`kind:contentRef`), nicht zufällig.
 * Grund: Legen zwei Geräte vor dem ersten Sync dieselbe logische Karte an,
 * teilen sie sich dieselbe ID und werden beim Sync per Last-Write-Wins
 * zusammengeführt statt dupliziert (siehe ADR-0002).
 */
import type { CardKind, UserVocab } from '@/types';
import { content } from '@/content';

export interface CardSeed {
  id: string;
  contentRef: string;
  kind: CardKind;
}

export function cardId(kind: CardKind, contentRef: string): string {
  return `${kind}:${contentRef}`;
}

function seed(kind: CardKind, contentRef: string): CardSeed {
  return { id: cardId(kind, contentRef), contentRef, kind };
}

/** Alle aus dem statischen Content + eigenen Vokabeln ableitbaren Kartenkeime. */
export function buildCardSeeds(userVocab: UserVocab[] = []): CardSeed[] {
  const seeds: CardSeed[] = [];

  for (const v of content.vokabeln) {
    seeds.push(seed('vocab_ar_de', v.id));
    seeds.push(seed('vocab_de_ar', v.id));
    if (v.plural) seeds.push(seed('plural', v.id));
    seeds.push(seed('root_to_word', v.id));
  }

  for (const n of content.nisba) {
    seeds.push(seed('nisba', n.id));
  }

  for (const verb of content.verben) {
    seeds.push(seed('conjugation', verb.id));
  }

  for (const mp of content.phonologie_minimalpaare) {
    seeds.push(seed('minimalpair', mp.id));
  }

  for (const uv of userVocab) {
    seeds.push(seed('vocab_ar_de', uv.id));
    seeds.push(seed('vocab_de_ar', uv.id));
    if (uv.plural) seeds.push(seed('plural', uv.id));
    seeds.push(seed('root_to_word', uv.id));
  }

  return seeds;
}
