import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEFAULT_SEED_DIR } from '../src/content/seed.js';
import { arabicKey, wordIdFor } from '../src/content/wordSuggestions.js';

describe('arabicKey', () => {
  it('gives two spellings of one word the same key', () => {
    // Article, sukun, case ending, tatweel.
    expect(arabicKey('المَسْجِد')).toBe(arabicKey('مَسْجِد'));
    expect(arabicKey('اَلْمَسْجِدُ')).toBe(arabicKey('مَسجِد'));
    expect(arabicKey('كِتابٌ')).toBe(arabicKey('كِتاب'));
    expect(arabicKey('  صَلاة ')).toBe(arabicKey('صَلَاة'));
    expect(arabicKey('دَرَسَ')).toBe(arabicKey('دَرَس'));
    // A long vowel with or without its short vowel, hamza on alif.
    expect(arabicKey('إِفْطار')).toBe(arabicKey('اِفْطَار'));
    expect(arabicKey('سَحُور')).toBe(arabicKey('سَحور'));
    expect(arabicKey('كَبِير')).toBe(arabicKey('كَبير'));
  });

  it('keeps words apart that differ in a vowel or a doubled letter', () => {
    const pairs = [
      ['رَجُل', 'رِجْل'],
      ['أَمامَ', 'إِمام'],
      ['مَنْ', 'مِنْ'],
      ['دَرَسَ', 'دَرَّسَ'],
      ['مَدْرَسة', 'مُدَرِّسة'],
      ['سَنة', 'سُنّة'],
      ['قِبْلة', 'قُبْلة'],
      ['دِين', 'دَيْن'],
      ['عَلى', 'عَلِيّ'],
      ['كِتاب', 'كاتِب'],
    ] as const;
    for (const [a, b] of pairs)
      expect(arabicKey(a), `${a} / ${b}`).not.toBe(arabicKey(b));
  });

  it('takes "ال" off only where it is the article', () => {
    expect(arabicKey('الله')).toBe('الله');
    expect(arabicKey('الآن')).toBe(arabicKey('الآن'));
    expect(arabicKey('الآن')).not.toBe(arabicKey('أَنْ'));
    expect(arabicKey('أَلْمانِيا')).not.toBe(arabicKey('مانِيا'));
    expect(arabicKey('أَلْوان')).not.toBe(arabicKey('وان'));
    expect(arabicKey('اِلْتَقى')).not.toBe(arabicKey('تَقِيّ'));
  });

  it('merges forms of the course’s words only where they differ in the ending or the article', () => {
    const byKey = new Map<string, Set<string>>();
    for (const file of readdirSync(DEFAULT_SEED_DIR)) {
      if (!file.endsWith('.json')) continue;
      const unit = JSON.parse(readFileSync(join(DEFAULT_SEED_DIR, file), 'utf8')) as {
        vokabeln: { ar: string }[];
      };
      for (const word of unit.vokabeln) {
        const key = arabicKey(word.ar);
        byKey.set(key, (byKey.get(key) ?? new Set()).add(word.ar));
      }
    }
    const merged = [...byKey.values()]
      .filter((words) => words.size > 1)
      .map((words) => [...words].sort());
    // The price of ignoring case endings: such a pair counts as one word, and its second
    // form is not suggested. Any other pair here would be two words taken for one.
    expect(merged.sort()).toEqual(
      [
        ['أَنْتَ', 'أَنْتِ'].sort(),
        ['مَساء', 'مَساءً'].sort(),
        ['يَوْم', 'اليَوْمَ'].sort(),
      ].sort()
    );
  });
});

describe('wordIdFor', () => {
  it('makes an id like the unit files have, from the transliteration', () => {
    expect(wordIdFor('masjid', new Set())).toBe('v-masjid');
    expect(wordIdFor('as-salām', new Set())).toBe('v-salam');
    expect(wordIdFor('ash-shams', new Set())).toBe('v-shams');
    expect(wordIdFor('ṣalāt al-jumʿa', new Set())).toBe('v-salat-al-jum-a');
    expect(wordIdFor('ʿīd', new Set())).toBe('v-id');
    expect(wordIdFor('…', new Set())).toBe('v-wort');
    // Only a real article goes: these words merely begin like one.
    expect(wordIdFor('asʾila', new Set())).toBe('v-as-ila');
    expect(wordIdFor('amʿāʾ', new Set())).toBe('v-am-a');
    expect(wordIdFor('anta', new Set())).toBe('v-anta');
  });

  it('never gives an id that is taken', () => {
    expect(wordIdFor('masjid', new Set(['v-masjid']))).toBe('v-masjid-2');
    expect(wordIdFor('masjid', new Set(['v-masjid', 'v-masjid-2']))).toBe('v-masjid-3');
  });

  it('gives ids the content schema accepts', () => {
    for (const tr of ['Ramaḍān', 'ḥalāl / ḥarām', `${'x'.repeat(59)} y`, '123', '-a-']) {
      expect(wordIdFor(tr, new Set())).toMatch(/^[A-Za-z0-9][A-Za-z0-9_.:#-]{0,79}$/);
      expect(wordIdFor(tr, new Set())).not.toMatch(/-$/);
    }
  });
});
