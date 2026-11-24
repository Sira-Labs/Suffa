import { describe, expect, it } from 'vitest';
import { plainArabic, wordIdFor } from '../src/content/wordSuggestions.js';

describe('plainArabic', () => {
  it('compares words without vowel signs, article and hamza carriers', () => {
    expect(plainArabic('مَسْجِد')).toBe('مسجد');
    expect(plainArabic('المَسْجِد')).toBe('مسجد');
    expect(plainArabic('أُسْرَة')).toBe(plainArabic('اسرة'));
    expect(plainArabic('مُسْتَشْفًى')).toBe(plainArabic('مستشفي'));
    expect(plainArabic('  صَلاة ')).toBe('صلاة');
    // "ال" that is the whole word, or nearly, is no article.
    expect(plainArabic('الله')).toBe('له');
    expect(plainArabic('ال')).toBe('ال');
    // Different words stay different.
    expect(plainArabic('كِتاب')).not.toBe(plainArabic('كاتِب'));
  });
});

describe('wordIdFor', () => {
  it('makes an id like the unit files have, from the transliteration', () => {
    expect(wordIdFor('masjid', new Set())).toBe('v-masjid');
    expect(wordIdFor('as-salām', new Set())).toBe('v-salam');
    expect(wordIdFor('ṣalāt al-jumʿa', new Set())).toBe('v-salat-al-jum-a');
    expect(wordIdFor('ʿīd', new Set())).toBe('v-id');
    expect(wordIdFor('…', new Set())).toBe('v-wort');
  });

  it('never gives an id that is taken', () => {
    expect(wordIdFor('masjid', new Set(['v-masjid']))).toBe('v-masjid-2');
    expect(wordIdFor('masjid', new Set(['v-masjid', 'v-masjid-2']))).toBe('v-masjid-3');
  });

  it('gives ids the content schema accepts', () => {
    for (const tr of ['Ramaḍān', 'ḥalāl / ḥarām', 'x'.repeat(200), '123']) {
      expect(wordIdFor(tr, new Set())).toMatch(/^[A-Za-z0-9][A-Za-z0-9_.:#-]{0,79}$/);
    }
  });
});
