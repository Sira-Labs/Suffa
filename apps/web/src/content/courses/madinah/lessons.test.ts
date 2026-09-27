import { describe, expect, it } from 'vitest';
import { courseById } from '@suffa/engagement';
import lessons from './book1-lessons.json';
import book from './book1.json';

const ARABIC = /[\u0600-\u06FF]/;

describe('Medina Book 1 own lesson content', () => {
  it('belongs to lessons of the course and of the book index', () => {
    const units = courseById('madinah').units;
    const indexed = new Set(book.lessons.map((l) => l.unit));
    for (const l of lessons.lessons) {
      expect(units).toContain(l.unit);
      expect(indexed.has(l.unit)).toBe(true);
      expect(l.unit - 100).toBe(l.lesson);
    }
  });

  it('has stable, unique ids and complete words', () => {
    const ids = lessons.lessons.flatMap((l) => l.words.map((w) => w.id));
    expect(new Set(ids).size).toBe(ids.length);
    for (const l of lessons.lessons) {
      for (const w of l.words) {
        expect(w.id).toMatch(new RegExp(`^md-${l.unit}-\\d{2}$`));
        expect(w.ar).toMatch(ARABIC);
        expect(w.de.trim()).not.toBe('');
      }
      expect(new Set(l.words.map((w) => w.ar)).size).toBe(l.words.length);
    }
  });

  it('explains grammar with Arabic examples and German translations', () => {
    for (const l of lessons.lessons) {
      expect(l.grammar.length).toBeGreaterThan(0);
      for (const g of l.grammar) {
        expect(g.examples.length).toBeGreaterThan(0);
        for (const e of g.examples) {
          expect(e.ar).toMatch(ARABIC);
          expect(e.de.trim()).not.toBe('');
        }
      }
    }
  });

  it('keeps lesson pages in order within the PDF', () => {
    const pages = book.lessons.map((l) => l.page);
    expect([...pages].sort((a, b) => a - b)).toEqual(pages);
  });
});
