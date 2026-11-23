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

  it('grades English glosses with English rules (story 16.4)', () => {
    // Articles and the infinitive marker are ignored, alternatives split as in German.
    expect(gradeTranslation('a country', 'country, place', 'en').verdict).toBe(
      'accepted'
    );
    expect(gradeTranslation('write', 'to write', 'en').verdict).toBe('exact');
    // British and American spellings are the same answer.
    expect(gradeTranslation('color', 'colour', 'en').verdict).toBe('exact');
    expect(gradeTranslation('center', 'centre', 'en').verdict).toBe('exact');
    expect(gradeTranslation('to organize', 'to organise', 'en').verdict).toBe('exact');
    expect(gradeTranslation('traveling', 'travelling', 'en').verdict).toBe('exact');
    expect(gradeTranslation('gray', 'grey', 'en').verdict).toBe('exact');
    // Typos are forgiven the same way; wrong words are wrong.
    expect(gradeTranslation('neighbuor', 'neighbour', 'en').verdict).toBe('typo');
    expect(gradeTranslation('city', 'country, place', 'en').verdict).toBe('wrong');
    // German articles are no English articles: "die" stays a word.
    expect(gradeTranslation('die', 'to die', 'en').verdict).toBe('exact');
    expect(gradeTranslation('die house', 'house', 'en').verdict).toBe('wrong');
  });

  it('grades Turkish glosses: letters typed without their marks, "bir" left out (18.4)', () => {
    expect(gradeTranslation('ogrenci', 'öğrenci', 'tr').verdict).toBe('exact');
    expect(gradeTranslation('kitap', 'bir kitap', 'tr').verdict).toBe('exact');
    // Dotless ı typed as i, and a capital İ or I at the start.
    expect(gradeTranslation('kapi', 'kapı', 'tr').verdict).toBe('exact');
    expect(gradeTranslation('İsim', 'isim', 'tr').verdict).toBe('exact');
    expect(gradeTranslation('Isik', 'ışık', 'tr').verdict).toBe('exact');
    expect(gradeTranslation('çay', 'çay, kahve', 'tr').verdict).toBe('accepted');
    expect(gradeTranslation('ögretmen', 'öğrenci', 'tr').verdict).toBe('wrong');
    // German articles are words here.
    expect(gradeTranslation('der kitap', 'kitap', 'tr').verdict).toBe('wrong');
    // ö and ü are one letter each, not the German oe and ue: a slip in a word typed
    // without its marks is one typo, and three-letter words get none.
    expect(gradeTranslation('ogrenc', 'öğrenci', 'tr').verdict).toBe('typo');
    expect(gradeTranslation('gozluc', 'gözlük', 'tr').verdict).toBe('typo');
    expect(gradeTranslation('söz', 'göz', 'tr').verdict).toBe('wrong');
    expect(gradeTranslation('göl', 'gül', 'tr').verdict).toBe('wrong');
    // German keeps its digraphs.
    expect(gradeTranslation('schoen', 'schön', 'de').verdict).toBe('exact');
    expect(gradeTranslation('schoen', 'schön', 'tr').verdict).not.toBe('exact');
  });

  it('grades Italian glosses: articles ignored, also the elided ones', () => {
    expect(gradeTranslation('libro', 'il libro', 'it').verdict).toBe('exact');
    expect(gradeTranslation("l'amico", 'amico', 'it').verdict).toBe('exact');
    expect(gradeTranslation('gli studenti', 'studenti', 'it').verdict).toBe('exact');
    expect(gradeTranslation('citta', 'città', 'it').verdict).toBe('exact');
    expect(gradeTranslation('una casa', 'casa; dimora', 'it').verdict).toBe('accepted');
    expect(gradeTranslation('cane', 'casa', 'it').verdict).toBe('wrong');
  });

  it('grades Bosnian glosses: č, ć, š, ž without marks, đ as dj', () => {
    expect(gradeTranslation('kuca', 'kuća', 'bs').verdict).toBe('exact');
    expect(gradeTranslation('ucenik', 'učenik', 'bs').verdict).toBe('exact');
    expect(gradeTranslation('medju', 'među', 'bs').verdict).toBe('exact');
    expect(gradeTranslation('Đak', 'đak', 'bs').verdict).toBe('exact');
    // … or as a plain d, which is no typo either.
    expect(gradeTranslation('medu', 'među', 'bs').verdict).toBe('exact');
    expect(gradeTranslation('dak', 'đak', 'bs').verdict).toBe('exact');
    expect(gradeTranslation('lak', 'đak', 'bs').verdict).toBe('wrong');
    // No articles: a leading "a" or "i" is part of the answer.
    expect(gradeTranslation('i knjiga', 'knjiga', 'bs').verdict).toBe('wrong');
  });

  it('grades Albanian glosses: ë and ç without marks, "një" left out, linking articles kept', () => {
    expect(gradeTranslation('shtepi', 'shtëpi', 'sq').verdict).toBe('exact');
    expect(gradeTranslation('libër', 'një libër', 'sq').verdict).toBe('exact');
    // "e hënë" is Monday, "hënë" the moon; "e re" is new, "re" a cloud.
    expect(gradeTranslation('hënë', 'e hënë', 'sq').verdict).toBe('wrong');
    expect(gradeTranslation('re', 'e re', 'sq').verdict).toBe('wrong');
    expect(gradeTranslation('dua', 'të dua', 'sq').verdict).toBe('wrong');
    // A gloss that allows the adjective without its article says so.
    expect(gradeTranslation('mirë', '(i) mirë', 'sq').verdict).toBe('exact');
    expect(gradeTranslation('i mire', '(i) mirë', 'sq').verdict).toBe('exact');
    expect(gradeTranslation('cfare', 'çfarë', 'sq').verdict).toBe('exact');
    expect(gradeTranslation('mal', 'det', 'sq').verdict).toBe('wrong');
  });
});
