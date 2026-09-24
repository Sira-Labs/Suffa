import { describe, expect, it } from 'vitest';
import {
  allowedTypos,
  editDistance,
  expandOptionalParts,
  gradeTranslation,
  normalizeTranslation,
  splitMeanings,
} from './translation';

describe('splitMeanings', () => {
  it.each([
    ['Land, Ort', ['Land', 'Ort']],
    ['Friede; Begrüßung', ['Friede', 'Begrüßung']],
    ['Ägypten / Ägypter(in)', ['Ägypten', 'Ägypter(in)']],
    ['Türkei / Türke (Türkin) – Plural gebrochen!', ['Türkei', 'Türke (Türkin)']],
    ['Name', ['Name']],
  ])('%s', (gloss, expected) => {
    expect(splitMeanings(gloss)).toEqual(expected);
  });

  it('keeps sentences whole', () => {
    expect(splitMeanings('Gut, Gott sei Dank.')).toEqual(['Gut, Gott sei Dank.']);
  });
});

describe('expandOptionalParts', () => {
  it('handles suffixes, prefixes and trailing alternatives', () => {
    expect(expandOptionalParts('Ägypter(in)')).toEqual(['Ägypter', 'Ägypterin']);
    expect(expandOptionalParts('(mir geht es) gut')).toEqual(['gut', 'mir geht es gut']);
    expect(expandOptionalParts('Türke (Türkin)')).toContain('Türkin');
  });
});

describe('normalizeTranslation', () => {
  it('folds case, umlauts, diacritics, punctuation and leading articles', () => {
    expect(normalizeTranslation('  Die Begrüßung! ')).toBe('begruessung');
    expect(normalizeTranslation('Chalīl')).toBe('chalil');
    expect(normalizeTranslation('to live')).toBe('live');
    expect(normalizeTranslation('das')).toBe('das'); // a lone article is kept
  });
});

describe('editDistance / allowedTypos', () => {
  it('counts transpositions as one edit', () => {
    expect(editDistance('ort', 'rot')).toBe(1);
    expect(editDistance('wohnugn', 'wohnung')).toBe(1);
  });
  it('scales tolerance with length', () => {
    expect(allowedTypos('Ort')).toBe(0);
    expect(allowedTypos('Name')).toBe(1);
    expect(allowedTypos('Nationalität')).toBe(2);
  });
});

describe('gradeTranslation', () => {
  it('accepts one meaning of a multi-meaning gloss (balad → „Ort“)', () => {
    const g = gradeTranslation('Ort', 'Land, Ort');
    expect(g.verdict).toBe('accepted');
    expect(g.matched).toEqual(['Ort']);
    expect(g.meanings).toEqual(['Land', 'Ort']);
  });

  it('treats all meanings in any order as exact', () => {
    expect(gradeTranslation('Ort, Land', 'Land, Ort').verdict).toBe('exact');
    expect(gradeTranslation('land ort', 'Land, Ort').verdict).toBe('exact');
  });

  it('ignores case, articles and umlaut spelling', () => {
    expect(gradeTranslation('die begruessung', 'Friede; Begrüßung').verdict).toBe(
      'accepted'
    );
    expect(gradeTranslation('der Friede', 'Friede; Begrüßung').verdict).toBe('accepted');
  });

  it('accepts optional parts and feminine forms', () => {
    expect(gradeTranslation('Ägypterin', 'Ägypten / Ägypter(in)').verdict).toBe(
      'accepted'
    );
    expect(gradeTranslation('gut', 'das Gute; (mir geht es) gut').verdict).toBe(
      'accepted'
    );
    expect(
      gradeTranslation('Türkin', 'Türkei / Türke (Türkin) – Plural gebrochen!').verdict
    ).toBe('accepted');
  });

  it('accepts umlauts typed as a/ae/oe/ue', () => {
    expect(gradeTranslation('Nationalitat', 'Nationalität').verdict).toBe('exact');
    expect(gradeTranslation('Nationalitaet', 'Nationalität').verdict).toBe('exact');
    expect(gradeTranslation('Begrussung', 'Friede; Begrüßung').verdict).toBe('accepted');
  });

  it('forgives small typos but flags them', () => {
    expect(gradeTranslation('Wohnnug', 'Wohnung, Wohnsitz').verdict).toBe('typo');
    expect(gradeTranslation('Nationalitäät', 'Nationalität').verdict).toBe('typo');
  });

  it('rejects wrong or partly wrong answers', () => {
    expect(gradeTranslation('Stadt', 'Land, Ort').verdict).toBe('wrong');
    expect(gradeTranslation('Ort, Stadt', 'Land, Ort').verdict).toBe('wrong');
    expect(gradeTranslation('', 'Land, Ort').verdict).toBe('wrong');
    expect(gradeTranslation('Rot', 'Land, Ort').verdict).toBe('wrong'); // short words: no typos
  });

  it('grades sentences as a whole, tolerant of punctuation and a typo', () => {
    expect(gradeTranslation('gut gott sei dank', 'Gut, Gott sei Dank.').verdict).toBe(
      'exact'
    );
    expect(gradeTranslation('Gut, Got sei Dank', 'Gut, Gott sei Dank.').verdict).toBe(
      'typo'
    );
    expect(gradeTranslation('Gut', 'Gut, Gott sei Dank.').verdict).toBe('wrong');
  });
});
