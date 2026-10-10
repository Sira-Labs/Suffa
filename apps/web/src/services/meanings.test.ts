import { afterEach, describe, expect, it } from 'vitest';
import { content } from '@/content';
import { generateExam } from '@/modules/exam/examEngine';
import { gradeRecall, resolveCard } from '@/services/srs';
import type { UserVocab } from '@/types';
import { consistentMeanings, meaningOf, resolveMeaningLanguage } from './meanings';

// Static content has no English yet (it arrives reviewed through the CMS); tests add some.
const word = content.vokabeln[0]!;
const other = content.vokabeln[1]!;

afterEach(() => {
  delete word.en;
  delete other.en;
});

describe('meaning language (story 16.4)', () => {
  it('shows the chosen gloss and falls back to German, flagged', () => {
    expect(meaningOf({ de: 'Haus', en: 'house' }, 'en')).toEqual({
      text: 'house',
      lang: 'en',
      missing: false,
    });
    expect(meaningOf({ de: 'Haus' }, 'en')).toEqual({
      text: 'Haus',
      lang: 'de',
      missing: true,
    });
    expect(meaningOf({ de: 'Haus', en: '  ' }, 'en').missing).toBe(true);
    expect(meaningOf({ de: 'Haus', en: 'house' }, 'de')).toEqual({
      text: 'Haus',
      lang: 'de',
      missing: false,
    });
  });

  it('follows the interface language unless the learner chose one', () => {
    expect(resolveMeaningLanguage(null, 'en')).toBe('en');
    expect(resolveMeaningLanguage(undefined, 'de')).toBe('de');
    expect(resolveMeaningLanguage('de', 'en')).toBe('de');
    expect(resolveMeaningLanguage('fr', 'fr')).toBe('de');
  });

  it('keeps the options of one question in one language', () => {
    const items = [
      { de: 'Haus', en: 'house' },
      { de: 'Buch', en: 'book' },
    ];
    expect(consistentMeanings(items, 'en')).toEqual({
      texts: ['house', 'book'],
      lang: 'en',
      missing: false,
    });
    expect(consistentMeanings([...items, { de: 'Stift' }], 'en')).toEqual({
      texts: ['Haus', 'Buch', 'Stift'],
      lang: 'de',
      missing: true,
    });
  });

  it('asks and grades review cards in the meaning language', () => {
    word.en = 'country, place';
    const card = resolveCard('vocab_ar_de', word.id, [], 'en')!;
    expect(card).toMatchObject({ answer: 'country, place', meaningLang: 'en' });
    expect(card.meaningMissing).toBe(false);
    expect(gradeRecall('a place', card.answer, false, card.meaningLang).verdict).toBe(
      'accepted'
    );
    expect(resolveCard('vocab_de_ar', word.id, [], 'en')).toMatchObject({
      prompt: 'country, place',
      meaningLang: 'en',
    });
    // Without English: the German gloss, flagged as not yet translated.
    expect(resolveCard('vocab_ar_de', other.id, [], 'en')).toMatchObject({
      answer: other.de,
      meaningLang: 'de',
      meaningMissing: true,
    });
    // German learners see what they always saw.
    expect(resolveCard('vocab_ar_de', word.id, [], 'de')).toMatchObject({
      answer: word.de,
      meaningLang: 'de',
      meaningMissing: false,
    });
  });

  it("keeps a learner's own word as they typed it", () => {
    const own: UserVocab = {
      id: 'uv-1',
      ar: 'قِطّ',
      tr: 'qiṭṭ',
      de: 'cat',
      wurzel: '',
      einheit: 0,
      updated_at: '2026-10-10T00:00:00.000Z',
      deleted: false,
    };
    expect(resolveCard('vocab_ar_de', own.id, [own], 'en')).toMatchObject({
      answer: 'cat',
      meaningMissing: false,
    });
  });

  it('builds exam questions with options in one language', () => {
    for (const v of content.vokabeln) v.en = `en:${v.de}`;
    try {
      const english = generateExam(
        { formats: ['vocab_ar_de'], units: [], count: 10 },
        'en'
      );
      for (const q of english) {
        expect(q.meaningLang).toBe('en');
        expect(q.expected.startsWith('en:')).toBe(true);
        expect(q.options!.every((o) => o.startsWith('en:'))).toBe(true);
      }
    } finally {
      for (const v of content.vokabeln) delete v.en;
    }
    // Nothing translated: German options, flagged once per question.
    const fallback = generateExam(
      { formats: ['vocab_ar_de'], units: [], count: 5 },
      'en'
    );
    for (const q of fallback) {
      expect(q).toMatchObject({ meaningLang: 'de', meaningMissing: true });
      expect(q.options!.some((o) => o.startsWith('en:'))).toBe(false);
    }
  });
});
