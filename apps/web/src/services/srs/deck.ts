/**
 * Deck builder: derives the SRS cards to study from the static course content.
 * One card = (contentRef, kind).
 *
 * The card ID is DETERMINISTIC (`kind:contentRef`), not random.
 * Reason: if two devices create the same logical card before the first sync,
 * they share the same ID and are merged via last-write-wins during sync
 * instead of being duplicated (see ADR-0002).
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

/** All card seeds derivable from the static content + the user's own vocabulary. */
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
