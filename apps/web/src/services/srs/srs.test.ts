import { describe, it, expect } from 'vitest';
import {
  createCard,
  schedule,
  isDue,
  previewIntervals,
  DEFAULT_EASE,
  MIN_EASE,
  LEECH_LAPSE_THRESHOLD,
} from './engine';
import { buildQueue, summarizeDue } from './queue';
import { gradeAnswer, normalizeArabic, stripTashkil, diffArabic } from './tashkil';
import type { SrsCard } from '@/types';

const NOW = new Date('2026-06-13T08:00:00.000Z');

function newCard(id = 'c1', kind: SrsCard['kind'] = 'vocab_ar_de'): SrsCard {
  return createCard({ id, contentRef: 'v-ism', kind, now: NOW });
}

describe('SRS engine: createCard', () => {
  it('creates an immediately due card with defaults', () => {
    const card = newCard();
    expect(card.reps).toBe(0);
    expect(card.ease).toBe(DEFAULT_EASE);
    expect(card.lapses).toBe(0);
    expect(card.leech).toBe(false);
    expect(card.deleted).toBe(false);
    expect(isDue(card, NOW)).toBe(true);
  });
});

describe('SRS engine: schedule – learning phase', () => {
  it('first "good" review → 1-day interval', () => {
    const card = schedule(newCard(), 'good', { now: NOW });
    expect(card.reps).toBe(1);
    expect(card.interval).toBe(1);
    expect(isDue(card, NOW)).toBe(false);
  });

  it('second "good" review → 6 days', () => {
    let card = schedule(newCard(), 'good', { now: NOW });
    card = schedule(card, 'good', { now: NOW });
    expect(card.reps).toBe(2);
    expect(card.interval).toBe(6);
  });

  it('"easy" in the learning phase jumps ahead faster', () => {
    const card = schedule(newCard(), 'easy', { now: NOW });
    expect(card.interval).toBe(4);
    expect(card.ease).toBeGreaterThan(DEFAULT_EASE);
  });

  it('third "good" review multiplies by ease', () => {
    let card = schedule(newCard(), 'good', { now: NOW }); // 1
    card = schedule(card, 'good', { now: NOW }); // 6
    const before = card.interval;
    card = schedule(card, 'good', { now: NOW });
    expect(card.interval).toBe(Math.round(before * card.ease));
    expect(card.interval).toBeGreaterThan(before);
  });
});

describe('SRS engine: schedule – lapse & ease', () => {
  it('"again" resets reps, increments lapses, interval 0', () => {
    let card = schedule(newCard(), 'good', { now: NOW });
    card = schedule(card, 'good', { now: NOW });
    card = schedule(card, 'again', { now: NOW });
    expect(card.reps).toBe(0);
    expect(card.lapses).toBe(1);
    expect(card.interval).toBe(0);
    expect(isDue(card, NOW)).toBe(true);
  });

  it('ease never drops below the minimum', () => {
    let card = newCard();
    for (let i = 0; i < 20; i++) {
      card = schedule(card, 'again', { now: NOW });
    }
    expect(card.ease).toBe(MIN_EASE);
  });

  it('marks a card as leech after enough lapses', () => {
    let card = newCard();
    for (let i = 0; i < LEECH_LAPSE_THRESHOLD; i++) {
      card = schedule(card, 'good', { now: NOW });
      card = schedule(card, 'again', { now: NOW });
    }
    expect(card.lapses).toBeGreaterThanOrEqual(LEECH_LAPSE_THRESHOLD);
    expect(card.leech).toBe(true);
  });
});

describe('SRS engine: previewIntervals', () => {
  it('returns monotonic intervals for all 4 ratings', () => {
    let card = schedule(newCard(), 'good', { now: NOW });
    card = schedule(card, 'good', { now: NOW }); // reps=2, interval=6
    const p = previewIntervals(card, NOW);
    expect(p.again).toBe(0);
    expect(p.hard).toBeLessThanOrEqual(p.good);
    expect(p.good).toBeLessThanOrEqual(p.easy);
  });
});

describe('SRS queue: buildQueue', () => {
  it('respects the new-card limit', () => {
    const cards = Array.from({ length: 30 }, (_, i) => newCard(`n${i}`));
    const q = buildQueue(cards, { now: NOW, newLimit: 5 });
    expect(q.length).toBe(5);
  });

  it('prioritises leeches over regular reviews', () => {
    const due: SrsCard = {
      ...newCard('due'),
      reps: 3,
      lastReviewed: '2026-06-10T08:00:00.000Z',
      due: '2026-06-12T00:00:00.000Z',
    };
    const leech: SrsCard = { ...due, id: 'leech', leech: true, lapses: 5 };
    const q = buildQueue([due, leech], { now: NOW });
    expect(q[0]!.id).toBe('leech');
  });

  it('mixes new cards between the reviews (old+new)', () => {
    const reviews = Array.from({ length: 6 }, (_, i) => ({
      ...newCard(`r${i}`),
      reps: 3,
      lastReviewed: '2026-06-10T08:00:00.000Z',
      due: '2026-06-12T00:00:00.000Z',
    }));
    const news = Array.from({ length: 2 }, (_, i) => newCard(`new${i}`));
    const q = buildQueue([...reviews, ...news], { now: NOW, newLimit: 2 });
    const newPositions = q
      .map((c, idx) => (c.reps === 0 ? idx : -1))
      .filter((x) => x >= 0);
    // Both new cards not clumped at the very start or very end.
    expect(newPositions.length).toBe(2);
    expect(newPositions[0]).toBeGreaterThan(0);
  });

  it('interleaves different card kinds', () => {
    const a = Array.from({ length: 4 }, (_, i) => newCard(`a${i}`, 'vocab_ar_de'));
    const b = Array.from({ length: 4 }, (_, i) => newCard(`b${i}`, 'plural'));
    const q = buildQueue([...a, ...b], { now: NOW, newLimit: 20 });
    // The first two cards should be of different kinds (round-robin).
    expect(q[0]!.kind).not.toBe(q[1]!.kind);
  });
});

describe('SRS queue: summarizeDue', () => {
  it('counts new, due and leech cards correctly', () => {
    const fresh = newCard('fresh');
    const dueCard: SrsCard = {
      ...newCard('due'),
      reps: 2,
      lastReviewed: NOW.toISOString(),
      due: '2026-06-12T00:00:00.000Z',
    };
    const futureCard: SrsCard = {
      ...newCard('future'),
      reps: 2,
      lastReviewed: NOW.toISOString(),
      due: '2026-07-12T00:00:00.000Z',
    };
    const s = summarizeDue([fresh, dueCard, futureCard], NOW);
    expect(s.newCount).toBe(1);
    expect(s.dueCount).toBe(1);
  });
});

describe('Tashkīl tolerance', () => {
  it('stripTashkil removes harakāt', () => {
    expect(stripTashkil('سَكَنَ')).toBe('سكن');
    expect(stripTashkil('الحَمْدُ')).toBe('الحمد');
  });

  it('normalizeArabic unifies alif and yāʾ variants', () => {
    expect(normalizeArabic('أحوال')).toBe(normalizeArabic('احوال'));
    expect(normalizeArabic('مصرى')).toBe(normalizeArabic('مصري'));
  });

  it('accepts input without tashkīl as tashkil-tolerant', () => {
    expect(gradeAnswer('سكن', 'سَكَنَ')).toBe('tashkil-tolerant');
  });

  it('recognises exact input including tashkīl', () => {
    expect(gradeAnswer('سَكَنَ', 'سَكَنَ')).toBe('exact');
  });

  it('rejects incorrect input', () => {
    expect(gradeAnswer('كتب', 'سَكَنَ')).toBe('wrong');
  });

  it('empty input is not tolerantly correct', () => {
    expect(gradeAnswer('', 'سَكَنَ')).toBe('wrong');
  });

  it('diffArabic marks missing and extra characters', () => {
    const segs = diffArabic('سكن', 'سكان');
    expect(segs.some((s) => s.status === 'removed')).toBe(true);
    expect(segs.map((s) => s.text).join('')).toContain('ا');
  });
});

describe('SRS queue: newKinds', () => {
  it('reviews every kind but takes new cards only from newKinds', () => {
    const dueNisba: SrsCard = {
      ...newCard('nisba:egypt', 'nisba'),
      reps: 2,
      lastReviewed: '2026-09-01T00:00:00.000Z',
      due: '2026-09-01T00:00:00.000Z',
    };
    const cards = [
      dueNisba,
      newCard('plural:x', 'plural'),
      newCard('vocab:y', 'vocab_ar_de'),
    ];
    const queue = buildQueue(cards, {
      now: new Date('2026-09-23T00:00:00Z'),
      newKinds: ['vocab_ar_de'],
    });
    expect(queue.map((c) => c.id)).toEqual(['nisba:egypt', 'vocab:y']);
  });
});

describe('SRS queue: contentRefs', () => {
  it('limits the queue to the given content items', () => {
    const cards = [newCard('vocab_ar_de:a'), newCard('vocab_ar_de:b')].map((c, i) => ({
      ...c,
      contentRef: i === 0 ? 'a' : 'b',
    }));
    expect(buildQueue(cards, { contentRefs: ['b'] }).map((c) => c.contentRef)).toEqual([
      'b',
    ]);
  });
});
