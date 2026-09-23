/**
 * Builds the daily due queue with interleaving and an old+new mix.
 *
 * Learning principles:
 *  - Spaced retrieval with old+new: due (old) cards and new cards are mixed
 *    in a configurable ratio instead of in blocks.
 *  - Interleaving: different CardKinds are mixed, not grouped.
 *  - Leeches/difficult cards get slight priority (deliberate practice).
 */
import type { CardKind, SrsCard } from '@/types';
import { isDue } from './engine';

export interface QueueOptions {
  now?: Date;
  /** Maximum number of new (never studied) cards per session. */
  newLimit?: number;
  /** Maximum total number of cards in the queue. */
  maxCards?: number;
  /** Restrict to certain card kinds (for mode-specific queues). */
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
 * Deterministic interleaving: groups by kind and takes one element from
 * each group in turn (round-robin), so that no two cards of the same kind
 * follow each other unnecessarily.
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
 * Builds the study queue: due reviews + a limited number of new cards,
 * interleaved and biased old-before-new (due cards interspersed first).
 */
export function buildQueue(cards: SrsCard[], options: QueueOptions = {}): SrsCard[] {
  const now = options.now ?? new Date();
  const newLimit = options.newLimit ?? 15;
  const maxCards = options.maxCards ?? 60;
  const kindFilter = options.kinds ? new Set(options.kinds) : null;

  const pool = cards.filter((c) => !c.deleted && (!kindFilter || kindFilter.has(c.kind)));

  const dueReviews = pool
    .filter((c) => !isNew(c) && isDue(c, now))
    // Leeches and the most overdue first.
    .sort((a, b) => {
      if (a.leech !== b.leech) return a.leech ? -1 : 1;
      return new Date(a.due).getTime() - new Date(b.due).getTime();
    });

  const newCards = pool.filter(isNew).slice(0, newLimit);

  const interleavedReviews = interleaveByKind(dueReviews);
  const interleavedNew = interleaveByKind(newCards);

  // Mix old+new: spread new cards evenly between the reviews.
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
