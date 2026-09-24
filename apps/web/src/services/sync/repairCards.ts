/**
 * Rebuilds SRS cards from their review logs when the logs know more than the card.
 *
 * Review logs are append-only with unique ids, so every device's reviews reach every other
 * device intact. A card, by contrast, is one record per word and could be overwritten by an
 * older state (see cardPrecedence in reconcile.ts). Scheduling is deterministic (no fuzz), so
 * replaying a card's logs in order yields exactly the state the reviews produced – on every
 * device alike, which lets two devices converge without talking to each other.
 */
import type { ReviewLog, SrsCard } from '@/types';
import { createCard, schedule } from '@/services/srs';

/**
 * The card as its review logs say it should be, or null when the card is already up to date
 * (its last review is at least as recent as the newest log).
 */
export function rebuildFromLogs(
  card: SrsCard,
  logs: readonly ReviewLog[]
): SrsCard | null {
  const own = logs
    .filter((l) => l.cardId === card.id && !l.deleted)
    .sort((a, b) => a.reviewedAt.localeCompare(b.reviewedAt) || a.id.localeCompare(b.id));
  const newest = own.at(-1);
  if (!newest) return null;
  const cardReviewed = card.lastReviewed ? Date.parse(card.lastReviewed) : -Infinity;
  if (Date.parse(newest.reviewedAt) <= cardReviewed) return null;

  let state = createCard({
    id: card.id,
    contentRef: card.contentRef,
    kind: card.kind,
    now: new Date(own[0]!.reviewedAt),
  });
  for (const log of own) {
    state = schedule(state, log.rating, { now: new Date(log.reviewedAt), fuzz: 0 });
  }
  // Keep what reviews do not record: a leech mark set elsewhere (e.g. from the exam).
  return { ...state, leech: state.leech || card.leech, deleted: card.deleted };
}

/** All cards whose logs are ahead of them, rebuilt. */
export function cardsToRepair(
  cards: readonly SrsCard[],
  logs: readonly ReviewLog[]
): SrsCard[] {
  const byCard = new Map<string, ReviewLog[]>();
  for (const log of logs) {
    const list = byCard.get(log.cardId);
    if (list) list.push(log);
    else byCard.set(log.cardId, [log]);
  }
  const repaired: SrsCard[] = [];
  for (const card of cards) {
    const own = byCard.get(card.id);
    if (!own) continue;
    const rebuilt = rebuildFromLogs(card, own);
    if (rebuilt) repaired.push(rebuilt);
  }
  return repaired;
}
