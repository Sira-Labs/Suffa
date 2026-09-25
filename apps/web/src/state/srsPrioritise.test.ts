import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createCard } from '@/services/srs/engine';

const put = vi.fn(async () => {});
vi.mock('@/services/storage', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/services/storage')>();
  return {
    ...original,
    cardRepo: { ...original.cardRepo, put: (...a: unknown[]) => put(...(a as [])) },
  };
});

const { useSrsStore } = await import('./srsStore');

describe('srsStore.prioritise (story 11.1)', () => {
  beforeEach(() => put.mockClear());

  it('makes the vocabulary cards of mistaken words due now, and only those', async () => {
    const later = new Date(Date.now() + 5 * 86_400_000);
    const earlier = new Date(Date.now() - 86_400_000);
    const cards = [
      createCard({
        id: 'vocab_ar_de:v-ism',
        contentRef: 'v-ism',
        kind: 'vocab_ar_de',
        now: later,
      }),
      createCard({
        id: 'vocab_de_ar:v-ism',
        contentRef: 'v-ism',
        kind: 'vocab_de_ar',
        now: earlier,
      }),
      createCard({ id: 'plural:v-ism', contentRef: 'v-ism', kind: 'plural', now: later }),
      createCard({
        id: 'vocab_ar_de:v-bayt',
        contentRef: 'v-bayt',
        kind: 'vocab_ar_de',
        now: later,
      }),
    ];
    useSrsStore.setState({ cards });
    expect(await useSrsStore.getState().prioritise(['v-ism'])).toBe(1);
    expect(put).toHaveBeenCalledTimes(1);
    const state = useSrsStore.getState().cards;
    expect(new Date(state[0]!.due).getTime()).toBeLessThanOrEqual(Date.now());
    expect(state[2]!.due).toBe(later.toISOString());
    expect(state[3]!.due).toBe(later.toISOString());
  });
});
