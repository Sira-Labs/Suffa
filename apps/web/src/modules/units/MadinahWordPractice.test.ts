import { describe, expect, it } from 'vitest';
import { meaningOptions } from './MadinahWordPractice';

const words = [
  { id: 'md-101-01', ar: 'بَيْتٌ', de: 'Haus' },
  { id: 'md-101-02', ar: 'مَسْجِدٌ', de: 'Moschee' },
  { id: 'md-101-03', ar: 'بَابٌ', de: 'Tür' },
  { id: 'md-101-04', ar: 'كِتابٌ', de: 'Buch' },
  { id: 'md-101-05', ar: 'قَلَمٌ', de: 'Stift' },
  { id: 'md-101-06', ar: 'مِفْتاحٌ', de: 'Schlüssel' },
];

describe('meaningOptions', () => {
  it('offers the meaning among at most four different meanings of the lesson', () => {
    for (const word of words) {
      const options = meaningOptions(word, words);
      expect(options).toContain(word.de);
      expect(options).toHaveLength(4);
      expect(new Set(options).size).toBe(4);
    }
  });

  it('is stable for a word and works with a short lesson', () => {
    expect(meaningOptions(words[0]!, words)).toEqual(meaningOptions(words[0]!, words));
    expect(meaningOptions(words[0]!, words.slice(0, 2)).sort()).toEqual([
      'Haus',
      'Moschee',
    ]);
  });
});
