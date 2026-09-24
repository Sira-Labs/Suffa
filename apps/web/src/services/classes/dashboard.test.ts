import { describe, expect, it } from 'vitest';
import { classMasteryByUnit, isInactive, lastActiveLabel, leechWords } from './dashboard';

const words = [
  { id: 'a', einheit: 1, ar: 'كِتاب', de: 'Buch' },
  { id: 'b', einheit: 1, ar: 'قَلَم', de: 'Stift' },
  { id: 'c', einheit: 2, ar: 'بَيت', de: 'Haus' },
];

describe('class dashboard helpers', () => {
  it('computes class mastery per unit over learners × words', () => {
    const mastery = classMasteryByUnit({ a: 2, b: 1, c: 5 }, 2, words);
    expect(mastery.get(1)).toBe(75); // 3 of 4 pairs
    expect(mastery.get(2)).toBe(100); // capped at the number of learners
    expect(classMasteryByUnit({}, 0, words).get(1)).toBe(0);
  });

  it('resolves leech ids to words and skips unknown ones', () => {
    expect(
      leechWords(
        [
          { contentRef: 'b', learners: 3 },
          { contentRef: 'own-1', learners: 1 },
        ],
        words
      )
    ).toEqual([{ ...words[1], learners: 3 }]);
  });

  it('describes when a learner was last active', () => {
    const now = new Date('2026-09-24T12:00:00');
    expect(lastActiveLabel(null, now)).toBe('noch nie');
    expect(lastActiveLabel(new Date('2026-09-24T08:00:00').toISOString(), now)).toBe(
      'heute'
    );
    expect(lastActiveLabel(new Date('2026-09-23T20:00:00').toISOString(), now)).toBe(
      'gestern'
    );
    expect(lastActiveLabel(new Date('2026-09-19T08:00:00').toISOString(), now)).toBe(
      'vor 5 Tagen'
    );
    expect(isInactive(null, now)).toBe(true);
    expect(isInactive(new Date('2026-09-23T08:00:00').toISOString(), now)).toBe(false);
    expect(isInactive(new Date('2026-09-20T08:00:00').toISOString(), now)).toBe(true);
  });
});
