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
  getQueue(
    kinds?: CardKind[],
    newLimit?: number,
    newKinds?: CardKind[],
    contentRefs?: string[]
  ): SrsCard[];
  summary(): DueSummary;
  /** Content items new cards may come from (reached units); null = everything. */
  introducible: ReadonlySet<string> | null;
  setIntroducible(refs: ReadonlySet<string> | null): void;
  /**
   * Brings the vocabulary cards of these words up now (mistakes from a graded text, story
   * 11.1). Written like any card change, so they sync through the outbox. Returns how many
   * cards were moved.
   */
  prioritise(contentRefs: readonly string[]): Promise<number>;
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

  getQueue(kinds, newLimit, newKinds, contentRefs) {
    return buildQueue(get().cards, {
      kinds,
      newLimit,
      newKinds,
      contentRefs,
      canIntroduce: introducer(get().introducible),
    });
  },

  summary() {
    return summarizeDue(get().cards, new Date(), introducer(get().introducible));
  },

  introducible: null,
  setIntroducible(refs) {
    set({ introducible: refs });
  },

  async prioritise(contentRefs) {
    const refs = new Set(contentRefs);
    const now = new Date();
    const iso = now.toISOString();
    const moved = get().cards.filter(
      (c) =>
        refs.has(c.contentRef) &&
        (c.kind === 'vocab_ar_de' || c.kind === 'vocab_de_ar') &&
        !c.deleted &&
        new Date(c.due) > now
    );
    for (const card of moved) await cardRepo.put({ ...card, due: iso, updated_at: iso });
    const byId = new Map(moved.map((c) => [c.id, { ...c, due: iso, updated_at: iso }]));
    set({ cards: get().cards.map((c) => byId.get(c.id) ?? c) });
    return moved.length;
  },
}));

function introducer(
  refs: ReadonlySet<string> | null
): ((contentRef: string) => boolean) | undefined {
  return refs ? (ref) => refs.has(ref) : undefined;
}
