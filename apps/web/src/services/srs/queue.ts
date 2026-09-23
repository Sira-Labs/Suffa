/**
 * Aufbau der täglichen Fälligkeits-Queue mit Interleaving und Alt+Neu-Mischung.
 *
 * Lernprinzipien:
 *  - Spaced Retrieval mit Alt+Neu: fällige (alte) Karten und neue Karten werden
 *    in einem konfigurierbaren Verhältnis gemischt statt blockweise.
 *  - Interleaving: verschiedene CardKinds werden durchmischt, nicht gebündelt.
 *  - Leech-/schwierige Karten werden leicht bevorzugt (Deliberate Practice).
 */
import type { CardKind, SrsCard } from '@/types';
import { isDue } from './engine';

export interface QueueOptions {
  now?: Date;
  /** Maximale Anzahl neuer (nie gelernter) Karten pro Sitzung. */
  newLimit?: number;
  /** Maximale Gesamtzahl der Karten in der Queue. */
  maxCards?: number;
  /** Auf bestimmte Kartentypen einschränken (für Modus-spezifische Queues). */
  kinds?: CardKind[];
}

export interface DueSummary {
  dueCount: number;
  newCount: number;
  leechCount: number;
  byKind: Record<string, number>;
}

function isNew(card: SrsCard): boolean {
  return card.reps === 0 && card.lastReviewed === null;
}

/**
 * Deterministisches Interleaving: gruppiert nach Kind und entnimmt
 * reihum je ein Element (Round-Robin), sodass keine zwei gleichen Kinds
 * unnötig aufeinanderfolgen.
 */
function interleaveByKind(cards: SrsCard[]): SrsCard[] {
  const groups = new Map<CardKind, SrsCard[]>();
  for (const c of cards) {
    const g = groups.get(c.kind) ?? [];
    g.push(c);
    groups.set(c.kind, g);
  }
  const lists = [...groups.values()];
  const result: SrsCard[] = [];
  let remaining = cards.length;
  while (remaining > 0) {
    for (const list of lists) {
      const next = list.shift();
      if (next) {
        result.push(next);
        remaining--;
      }
    }
  }
  return result;
}

/**
 * Baut die Lern-Queue: fällige Wiederholungen + begrenzt neue Karten,
 * interleaved und mit Alt-vor-Neu-Tendenz (fällige zuerst eingestreut).
 */
export function buildQueue(cards: SrsCard[], options: QueueOptions = {}): SrsCard[] {
  const now = options.now ?? new Date();
  const newLimit = options.newLimit ?? 15;
  const maxCards = options.maxCards ?? 60;
  const kindFilter = options.kinds ? new Set(options.kinds) : null;

  const pool = cards.filter((c) => !c.deleted && (!kindFilter || kindFilter.has(c.kind)));

  const dueReviews = pool
    .filter((c) => !isNew(c) && isDue(c, now))
    // Leeches und am stärksten überfällige zuerst.
    .sort((a, b) => {
      if (a.leech !== b.leech) return a.leech ? -1 : 1;
      return new Date(a.due).getTime() - new Date(b.due).getTime();
    });

  const newCards = pool.filter(isNew).slice(0, newLimit);

  const interleavedReviews = interleaveByKind(dueReviews);
  const interleavedNew = interleaveByKind(newCards);

  // Alt+Neu mischen: neue Karten gleichmäßig zwischen die Wiederholungen streuen.
  const merged: SrsCard[] = [];
  const total = interleavedReviews.length + interleavedNew.length;
  const ratio = interleavedNew.length > 0 ? total / interleavedNew.length : Infinity;
  let ni = 0;
  let nextNewAt = ratio;
  for (let i = 0; i < interleavedReviews.length; i++) {
    merged.push(interleavedReviews[i]!);
    while (ni < interleavedNew.length && merged.length >= nextNewAt) {
      merged.push(interleavedNew[ni++]!);
      nextNewAt += ratio;
    }
  }
  while (ni < interleavedNew.length) merged.push(interleavedNew[ni++]!);

  return merged.slice(0, maxCards);
}

export function summarizeDue(cards: SrsCard[], now: Date = new Date()): DueSummary {
  const summary: DueSummary = { dueCount: 0, newCount: 0, leechCount: 0, byKind: {} };
  for (const c of cards) {
    if (c.deleted) continue;
    if (isNew(c)) summary.newCount++;
    else if (isDue(c, now)) summary.dueCount++;
    if (c.leech) summary.leechCount++;
    if (isNew(c) || isDue(c, now)) {
      summary.byKind[c.kind] = (summary.byKind[c.kind] ?? 0) + 1;
    }
  }
  return summary;
}
