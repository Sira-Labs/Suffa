import { describe, expect, it } from 'vitest';
import { content, wurzelFamilien } from '@/content';
import familiesRaw from '@/content/roots/families.json';
import {
  buildFamily,
  makePatternQuestion,
  PATTERNS,
  patternWords,
  rootSegments,
  verbPattern,
} from './family';

/** The root letters as the colouring finds them, e.g. "ك|ت|ب" → "كتب" without vowels. */
function marked(word: string, root: string): string {
  return rootSegments(word, root)
    .filter((s) => s.root)
    .map((s) => s.text.replace(/[\u064B-\u065F\u0670]/g, ''))
    .join('');
}

describe('rootSegments', () => {
  it('marks the root letters in order and keeps their vowels', () => {
    expect(rootSegments('مَكْتَبَة', 'ك-ت-ب')).toEqual([
      { text: 'مَ', root: false },
      { text: 'كْتَبَ', root: true },
      { text: 'ة', root: false },
    ]);
    expect(marked('كاتِب', 'ك-ت-ب')).toBe('كتب');
    expect(marked('مَكْتوب', 'ك-ت-ب')).toBe('كتب');
    expect(marked('مُدَرِّس', 'د-ر-س')).toBe('درس');
  });

  it('never takes the article or a prefix for the root', () => {
    expect(marked('السَّلام', 'س-ل-م')).toBe('سلم');
    expect(rootSegments('السَّلام', 'س-ل-م')[0]).toEqual({ text: 'ال', root: false });
    expect(marked('اِسْتَيْقَظَ', 'ي-ق-ظ')).toBe('يقظ');
    expect(marked('مُسْلِم', 'س-ل-م')).toBe('سلم');
  });

  it('handles weak, hamzated and doubled roots', () => {
    expect(marked('قالَ', 'ق-و-ل')).toBe('قال');
    expect(marked('اِشْتَرى', 'ش-ر-ي')).toBe('شرى');
    expect(marked('قَرَأَ', 'ق-ر-أ')).toBe('قرأ');
    expect(marked('أَكَلَ', 'أ-ك-ل')).toBe('أكل');
    expect(marked('أَحَبَّ', 'ح-ب-ب')).toBe('حب');
  });
});

describe('root families', () => {
  const all = (root: string) =>
    buildFamily(
      root,
      wurzelFamilien.get(root)?.vokabeln ?? [],
      wurzelFamilien.get(root)?.verben ?? [],
      (item) => (item.einheit ?? 99) <= 7
    );

  it('joins course words, verbs and our derivations without duplicates', () => {
    const family = all('ك-ت-ب');
    const ar = family.words.map((w) => w.ar);
    expect(new Set(ar).size).toBe(ar.length);
    expect(ar).toEqual(expect.arrayContaining(['كَتَبَ', 'كِتاب', 'كاتِب', 'مَكْتوب']));
    expect(family.words.find((w) => w.ar === 'كاتِب')).toMatchObject({
      source: 'extra',
      learned: false,
      wazn: 'فاعِل',
    });
    // Learned words come first.
    const firstUnlearned = family.words.findIndex((w) => !w.learned);
    expect(family.words.slice(firstUnlearned).every((w) => !w.learned)).toBe(true);
  });

  it('keeps a course word that is also a derivation and adds its missing pattern', () => {
    const tabbakh = all('ط-ب-خ').words.filter((w) => w.ar === 'طَبّاخ');
    expect(tabbakh).toHaveLength(1);
    expect(tabbakh[0]!.source).toBe('word');
    const khaarij = all('خ-ر-ج').words.find((w) => w.ar === 'خارِج');
    expect(khaarij).toMatchObject({ source: 'word', wazn: 'فاعِل' });
  });

  it('only extends roots the course teaches, with patterns we explain', () => {
    const extras = familiesRaw.families as Record<string, { wazn?: string }[]>;
    for (const [root, words] of Object.entries(extras)) {
      expect(wurzelFamilien.has(root), root).toBe(true);
      for (const w of words) if (w.wazn) expect(PATTERNS.has(w.wazn), w.wazn).toBe(true);
    }
    for (const verb of content.verben) {
      expect(PATTERNS.has(verbPattern(verb.wazn)), verb.wazn).toBe(true);
    }
  });

  it('lists words by pattern for the trainer', () => {
    const words = patternWords([all('ك-ت-ب'), all('د-ر-س')]);
    expect(words.find((w) => w.ar === 'مَكْتَبَة')).toMatchObject({
      root: 'ك-ت-ب',
      wazn: 'مَفْعَلَة',
    });
    expect(words.every((w) => w.wazn && PATTERNS.has(w.wazn))).toBe(true);
  });
});

describe('makePatternQuestion', () => {
  const w = (ar: string, root: string, wazn: string) => ({
    key: ar,
    ar,
    de: ar,
    wazn,
    source: 'extra' as const,
    learned: true,
    root,
  });
  const pool = [
    w('مَكْتَب', 'ك-ت-ب', 'مَفْعَل'),
    w('كاتِب', 'ك-ت-ب', 'فاعِل'),
    w('مَكْتوب', 'ك-ت-ب', 'مَفْعول'),
    w('مَلْعَب', 'ل-ع-ب', 'مَفْعَل'),
    w('لاعِب', 'ل-ع-ب', 'فاعِل'),
  ];

  it('offers the answer among words of the same root or the same pattern', () => {
    for (let seed = 0; seed < 20; seed++) {
      let n = seed;
      const random = () => (n = (n * 9301 + 49297) % 233280) / 233280;
      const q = makePatternQuestion(pool, random)!;
      const ars = q.options.map((o) => o.ar);
      expect(ars).toContain(q.answer.ar);
      expect(new Set(ars).size).toBe(ars.length);
      expect(q.options.length).toBeGreaterThanOrEqual(2);
      expect(q.options.length).toBeLessThanOrEqual(4);
      for (const o of q.options) {
        if (o.ar === q.answer.ar) continue;
        expect(o.root === q.answer.root || o.wazn === q.answer.wazn).toBe(true);
        // A wrong option never has both the same root and the same pattern.
        expect(o.root === q.answer.root && o.wazn === q.answer.wazn).toBe(false);
      }
      expect(q.pattern.wazn).toBe(q.answer.wazn);
    }
  });

  it('gives no question without a second option', () => {
    expect(makePatternQuestion([pool[0]!])).toBeNull();
  });
});
