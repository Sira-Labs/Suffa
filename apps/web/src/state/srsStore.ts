/**
 * SRS store: holds the cards reactively, ensures they exist (seeding from
 * content) and encapsulates the review flow (rating → reschedule → log → persist).
 */
import { create } from 'zustand';
import type { CardKind, ReviewRating, SrsCard } from '@/types';
import {
  buildCardSeeds,
  buildQueue,
  createCard,
  schedule,
  summarizeDue,
  type DueSummary,
} from '@/services/srs';
import { cardRepo, reviewLogRepo, userVocabRepo } from '@/services/storage';

interface SrsState {
  cards: SrsCard[];
  loaded: boolean;
  load(): Promise<void>;
  ensureSeedCards(): Promise<void>;
  review(card: SrsCard, rating: ReviewRating, durationMs: number): Promise<SrsCard>;
  getQueue(kinds?: CardKind[], newLimit?: number): SrsCard[];
  summary(): DueSummary;
}

export const useSrsStore = create<SrsState>((set, get) => ({
  cards: [],
  loaded: false,

  async load() {
    await get().ensureSeedCards();
    const cards = await cardRepo.all();
    set({ cards, loaded: true });
  },

  async ensureSeedCards() {
    const existing = await cardRepo.all();
    const existingIds = new Set(existing.map((c) => c.id));
    const userVocab = await userVocabRepo.all();
    const seeds = buildCardSeeds(userVocab);
    const missing = seeds.filter((s) => !existingIds.has(s.id));
    for (const s of missing) {
      await cardRepo.put(
        createCard({ id: s.id, contentRef: s.contentRef, kind: s.kind })
      );
    }
  },

  async review(card, rating, durationMs) {
    const updated = schedule(card, rating);
    await cardRepo.put(updated);
    await reviewLogRepo.add({
      cardId: updated.id,
      contentRef: updated.contentRef,
      kind: updated.kind,
      rating,
      durationMs,
      scheduledInterval: updated.interval,
      reviewedAt: new Date().toISOString(),
    });
    set({
      cards: get().cards.map((c) => (c.id === updated.id ? updated : c)),
    });
    return updated;
  },

  getQueue(kinds, newLimit) {
    return buildQueue(get().cards, { kinds, newLimit });
  },

  summary() {
    return summarizeDue(get().cards);
  },
}));
