import { describe, expect, it } from 'vitest';
import { assessLetters } from '../src/index.js';

const statuses = (expected: string, transcript: string) =>
  assessLetters(expected, transcript).letters.map((l) => `${l.letter}:${l.status}`);

describe('letter feedback from a transcript', () => {
  it('rates every spoken letter good when the recogniser heard the text', () => {
    const result = assessLetters('السَّلامُ عَلَيْكُمْ', 'السلام عليكم');
    expect(result.score).toBe(1);
    expect(result.tips).toEqual([]);
    expect(result.letters.every((l) => l.status === 'good')).toBe(true);
    // The assimilated lam is written but not spoken, so it is not rated.
    expect(result.letters.map((l) => l.letter).join('')).toBe('اسلامعليكم');
  });

  it('ignores spellings a recogniser varies: hamza seats, tāʾ marbūṭa, alif maqṣūra', () => {
    expect(assessLetters('أَنا', 'انا').score).toBe(1);
    expect(assessLetters('مَدْرَسَةٌ', 'مدرسه').score).toBe(1);
    expect(assessLetters('عَلى', 'علي').score).toBe(1);
  });

  it('marks a typical confusion as wrong and explains the sound', () => {
    const result = assessLetters('صَباحُ الْخَيْرِ', 'سباح الخير');
    expect(result.letters[0]).toMatchObject({ letter: 'ص', status: 'wrong', heard: 'س' });
    expect(result.tips[0]).toMatch(/^ص \(ṣad\)/);
    expect(result.score).toBeLessThan(1);
  });

  it('marks a missing ʿain as wrong (heard as a plain vowel)', () => {
    expect(statuses('عَرَبِيٌّ', 'اربي')[0]).toBe('ع:wrong');
  });

  it('only flags letters it cannot judge as "check": missing or swapped for another', () => {
    const result = assessLetters('كِتابٌ', 'كتب');
    expect(result.letters.find((l) => l.letter === 'ا')).toMatchObject({
      status: 'check',
      heard: null,
    });
    expect(result.tips).toEqual([
      'Lange Vokale (ā, ī, ū) deutlich doppelt so lang halten.',
    ]);
    expect(statuses('بَيْتٌ', 'بيس')).toEqual(['ب:good', 'ي:good', 'ت:check']);
    expect(result.score).toBeCloseTo((3 + 0.5) / 4);
  });

  it('gives tips for doubled consonants and hamza, wrong ones first, at most three', () => {
    expect(assessLetters('مُدَرِّسٌ', 'مدس').tips).toContain(
      'ر (ra): ein gerolltes Zungen-r.'
    );
    expect(assessLetters('ذَكَّرَ', 'ذر').tips).toEqual([
      'Schadda: den doppelten Konsonanten hörbar länger halten.',
    ]);
    expect(assessLetters('سَأَلَ', 'سل').tips[0]).toMatch(/^Hamza/);
    const many = assessLetters('صَحيحٌ طَعامٌ ظَهْرٌ', 'سهيه تامه زهر');
    expect(many.tips).toHaveLength(3);
    expect(many.tips[0]).toMatch(/^ح/);
  });

  it('copes with an empty transcript and extra words', () => {
    const silent = assessLetters('بابٌ', '');
    expect(silent.score).toBe(0.5);
    expect(silent.letters.every((l) => l.status === 'check')).toBe(true);
    expect(assessLetters('بابٌ', 'هذا باب كبير').score).toBe(1);
    expect(assessLetters('', 'باب').score).toBe(0);
  });

  it('points each result at its letter and word in the expected text', () => {
    const text = 'هٰذا بَيْتٌ';
    const { letters } = assessLetters(text, 'هذا بيت');
    expect(letters.map((l) => text[l.index])).toEqual(['ه', 'ذ', 'ا', 'ب', 'ي', 'ت']);
    expect(letters.map((l) => l.word)).toEqual([0, 0, 0, 1, 1, 1]);
  });
});
