import { describe, expect, it } from 'vitest';
import { content } from '@/content';
import catalog from '@/content/sources/examples.json';
import type { ExampleCatalog } from '@/types';

const data = catalog as ExampleCatalog;
const HARAKAT = /[ً-ْ]/;

/** Guards the reviewed Tatoeba examples: attributable, vocalized, tied to real words. */
describe('example sentences', () => {
  it('names source and licence', () => {
    expect(data.source).toMatchObject({ name: 'Tatoeba', license: 'CC BY 2.0 FR' });
  });

  it('only covers existing words, at most two sentences each', () => {
    const ids = new Set(content.vokabeln.map((v) => v.id));
    for (const [vocabId, list] of Object.entries(data.examples)) {
      expect(ids.has(vocabId), vocabId).toBe(true);
      expect(list.length).toBeGreaterThan(0);
      expect(list.length).toBeLessThanOrEqual(2);
    }
    // Every word of Book 1 has at least one example.
    expect(Object.keys(data.examples).length).toBe(content.vokabeln.length);
  });

  it('keeps every sentence vocalized, translated and attributable', () => {
    for (const list of Object.values(data.examples)) {
      for (const e of list) {
        expect(e.ar).toMatch(HARAKAT);
        expect(e.de.trim().length).toBeGreaterThan(1);
        if (e.quelle === 'tatoeba')
          expect(Number.isInteger(e.tatoeba) && e.tatoeba! > 0).toBe(true);
        else expect(e.quelle).toBe('suffa');
        expect(['tatoeba', 'suffa']).toContain(e.deVon);
      }
    }
  });
});
