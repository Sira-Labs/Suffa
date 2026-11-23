import { describe, expect, it } from 'vitest';
import {
  approvedByWord,
  withApprovedMeanings,
  type ApprovedMeaning,
} from '../src/content/bundleMeanings.js';
import type { UnitFile } from '../src/content/schema.js';

const word = (id: string, de: string, extra: object = {}) => ({
  id,
  ar: 'اسْم',
  tr: 'ism',
  de,
  wurzel: 'س-م-و',
  einheit: 1,
  ...extra,
});
const unit = (einheit: number, vokabeln: object[]): UnitFile =>
  ({ einheit, titel: 'Begrüßung', vokabeln, dialoge: [], grammatik: [] }) as never;
const approved = (
  wordId: string,
  language: ApprovedMeaning['language'],
  text: string,
  sourceDe: string,
  unitNo = 1
): ApprovedMeaning => ({ unit: unitNo, wordId, language, sourceDe, text });

describe('withApprovedMeanings', () => {
  it('puts each word’s approved meanings under `bedeutungen` and leaves the rest alone', () => {
    const units = [unit(1, [word('v-ism', 'Name'), word('v-bab', 'Tür')])];
    const [merged] = withApprovedMeanings(units, [
      approved('v-ism', 'tr', 'isim', 'Name'),
      approved('v-ism', 'sq', 'emër', 'Name'),
    ]);
    expect(merged!.vokabeln[0]).toEqual({
      ...word('v-ism', 'Name'),
      bedeutungen: { sq: 'emër', tr: 'isim' },
    });
    // The transliteration keeps its field.
    expect(merged!.vokabeln[0]!.tr).toBe('ism');
    expect(merged!.vokabeln[1]).toEqual(word('v-bab', 'Tür'));
    expect(units[0]!.vokabeln[0]).toEqual(word('v-ism', 'Name'));
  });

  it('leaves out a meaning approved for other German than the published word has', () => {
    const [merged] = withApprovedMeanings(
      [unit(1, [word('v-ism', 'Name')])],
      [
        approved('v-ism', 'tr', 'isim', 'Name, Bezeichnung'),
        approved('v-ism', 'it', ' ', 'Name'),
      ]
    );
    expect(merged!.vokabeln[0]).toEqual(word('v-ism', 'Name'));
  });

  it('keeps units apart: the same word id in another unit gets nothing', () => {
    const merged = withApprovedMeanings(
      [
        unit(1, [word('v-ism', 'Name')]),
        unit(2, [word('v-ism', 'Name', { einheit: 2 })]),
      ],
      [approved('v-ism', 'bs', 'ime', 'Name', 2)]
    );
    expect(merged[0]!.vokabeln[0]).not.toHaveProperty('bedeutungen');
    expect(merged[1]!.vokabeln[0]).toHaveProperty('bedeutungen', { bs: 'ime' });
  });

  it('takes a meaning that is no longer approved away from a word that had it', () => {
    const had = word('v-ism', 'Name', { bedeutungen: { tr: 'isim', it: 'nome' } });
    const meaningsOf = approvedByWord([approved('v-ism', 'it', 'nome', 'Name')]);
    expect(meaningsOf(1, had)).toEqual({
      ...word('v-ism', 'Name'),
      bedeutungen: { it: 'nome' },
    });
  });

  it('drops meanings a unit file brings along itself: only a review puts them there', () => {
    const [merged] = withApprovedMeanings(
      [unit(1, [word('v-ism', 'Name', { bedeutungen: { tr: 'ungeprüft' } })])],
      []
    );
    expect(merged!.vokabeln[0]).toEqual(word('v-ism', 'Name'));
  });
});
