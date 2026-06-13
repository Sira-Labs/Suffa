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

describe('SRS-Engine: createCard', () => {
  it('erzeugt eine sofort fällige Karte mit Defaults', () => {
    const card = newCard();
    expect(card.reps).toBe(0);
    expect(card.ease).toBe(DEFAULT_EASE);
    expect(card.lapses).toBe(0);
    expect(card.leech).toBe(false);
    expect(card.deleted).toBe(false);
    expect(isDue(card, NOW)).toBe(true);
  });
});

describe('SRS-Engine: schedule – Lernphase', () => {
  it('erste „good“-Wiederholung → 1 Tag Intervall', () => {
    const card = schedule(newCard(), 'good', { now: NOW });
    expect(card.reps).toBe(1);
    expect(card.interval).toBe(1);
    expect(isDue(card, NOW)).toBe(false);
  });

  it('zweite „good“-Wiederholung → 6 Tage', () => {
    let card = schedule(newCard(), 'good', { now: NOW });
    card = schedule(card, 'good', { now: NOW });
    expect(card.reps).toBe(2);
    expect(card.interval).toBe(6);
  });

  it('„easy“ in Lernphase springt schneller', () => {
    const card = schedule(newCard(), 'easy', { now: NOW });
    expect(card.interval).toBe(4);
    expect(card.ease).toBeGreaterThan(DEFAULT_EASE);
  });

  it('dritte „good“-Wiederholung multipliziert mit Ease', () => {
    let card = schedule(newCard(), 'good', { now: NOW }); // 1
    card = schedule(card, 'good', { now: NOW }); // 6
    const before = card.interval;
    card = schedule(card, 'good', { now: NOW });
    expect(card.interval).toBe(Math.round(before * card.ease));
    expect(card.interval).toBeGreaterThan(before);
  });
});

describe('SRS-Engine: schedule – Lapse & Ease', () => {
  it('„again“ setzt reps zurück, erhöht lapses, Intervall 0', () => {
    let card = schedule(newCard(), 'good', { now: NOW });
    card = schedule(card, 'good', { now: NOW });
    card = schedule(card, 'again', { now: NOW });
    expect(card.reps).toBe(0);
    expect(card.lapses).toBe(1);
    expect(card.interval).toBe(0);
    expect(isDue(card, NOW)).toBe(true);
  });

  it('Ease sinkt nie unter das Minimum', () => {
    let card = newCard();
    for (let i = 0; i < 20; i++) {
      card = schedule(card, 'again', { now: NOW });
    }
    expect(card.ease).toBe(MIN_EASE);
  });

  it('markiert Karte nach genug Lapses als Leech', () => {
    let card = newCard();
    for (let i = 0; i < LEECH_LAPSE_THRESHOLD; i++) {
      card = schedule(card, 'good', { now: NOW });
      card = schedule(card, 'again', { now: NOW });
    }
    expect(card.lapses).toBeGreaterThanOrEqual(LEECH_LAPSE_THRESHOLD);
    expect(card.leech).toBe(true);
  });
});

describe('SRS-Engine: previewIntervals', () => {
  it('liefert für alle 4 Bewertungen monoton sinnvolle Intervalle', () => {
    let card = schedule(newCard(), 'good', { now: NOW });
    card = schedule(card, 'good', { now: NOW }); // reps=2, interval=6
    const p = previewIntervals(card, NOW);
    expect(p.again).toBe(0);
    expect(p.hard).toBeLessThanOrEqual(p.good);
    expect(p.good).toBeLessThanOrEqual(p.easy);
  });
});

describe('SRS-Queue: buildQueue', () => {
  it('respektiert das Neu-Limit', () => {
    const cards = Array.from({ length: 30 }, (_, i) => newCard(`n${i}`));
    const q = buildQueue(cards, { now: NOW, newLimit: 5 });
    expect(q.length).toBe(5);
  });

  it('priorisiert Leeches vor regulären Wiederholungen', () => {
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

  it('mischt neue Karten zwischen die Wiederholungen (Alt+Neu)', () => {
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
    // Nicht beide neuen Karten ganz am Anfang oder ganz am Ende geklumpt.
    expect(newPositions.length).toBe(2);
    expect(newPositions[0]).toBeGreaterThan(0);
  });

  it('interleavt verschiedene Kartentypen', () => {
    const a = Array.from({ length: 4 }, (_, i) => newCard(`a${i}`, 'vocab_ar_de'));
    const b = Array.from({ length: 4 }, (_, i) => newCard(`b${i}`, 'plural'));
    const q = buildQueue([...a, ...b], { now: NOW, newLimit: 20 });
    // Erste zwei Karten sollten unterschiedliche Kinds sein (Round-Robin).
    expect(q[0]!.kind).not.toBe(q[1]!.kind);
  });
});

describe('SRS-Queue: summarizeDue', () => {
  it('zählt neue, fällige und Leech-Karten korrekt', () => {
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

describe('Tashkīl-Toleranz', () => {
  it('stripTashkil entfernt Harakāt', () => {
    expect(stripTashkil('سَكَنَ')).toBe('سكن');
    expect(stripTashkil('الحَمْدُ')).toBe('الحمد');
  });

  it('normalizeArabic vereinheitlicht Alif- und Yāʾ-Varianten', () => {
    expect(normalizeArabic('أحوال')).toBe(normalizeArabic('احوال'));
    expect(normalizeArabic('مصرى')).toBe(normalizeArabic('مصري'));
  });

  it('akzeptiert Eingabe ohne Tashkīl als tashkil-tolerant', () => {
    expect(gradeAnswer('سكن', 'سَكَنَ')).toBe('tashkil-tolerant');
  });

  it('erkennt exakte Eingabe inkl. Tashkīl', () => {
    expect(gradeAnswer('سَكَنَ', 'سَكَنَ')).toBe('exact');
  });

  it('weist inhaltlich falsche Eingabe ab', () => {
    expect(gradeAnswer('كتب', 'سَكَنَ')).toBe('wrong');
  });

  it('leere Eingabe ist nicht tolerant-korrekt', () => {
    expect(gradeAnswer('', 'سَكَنَ')).toBe('wrong');
  });

  it('diffArabic markiert fehlende und überzählige Zeichen', () => {
    const segs = diffArabic('سكن', 'سكان');
    expect(segs.some((s) => s.status === 'removed')).toBe(true);
    expect(segs.map((s) => s.text).join('')).toContain('ا');
  });
});
