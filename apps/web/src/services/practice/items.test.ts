import { describe, expect, it } from 'vitest';
import type { PracticeRecord } from '@/types';
import { lineId, practiceCount, practiceId, unitPracticeItems } from './items';

const bundle = {
  dialoge: [
    {
      id: 'd1',
      einheit: 1,
      dialog: 1,
      titel: 't',
      zeilen: [
        { sp: 'a', ar: 'x', de: 'x' },
        { sp: 'b', ar: 'y', de: 'y' },
      ],
    },
    {
      id: 'd2',
      einheit: 2,
      dialog: 1,
      titel: 't',
      zeilen: [{ sp: 'a', ar: 'z', de: 'z' }],
    },
  ],
  vokabeln: [
    { id: 'w1', einheit: 1, ar: 'a', tr: 'a', de: 'a', wurzel: 'a' },
    { id: 'w2', einheit: 2, ar: 'b', tr: 'b', de: 'b', wurzel: 'b' },
  ],
  verben: [{ id: 'v1', einheit: 1 }, { id: 'v2' }],
} as unknown as Parameters<typeof unitPracticeItems>[0];

describe('unit practice items', () => {
  it('collects the items of one unit per skill', () => {
    expect(unitPracticeItems(bundle, 1)).toEqual({
      read: ['d1'],
      write: ['w1'],
      speak: [lineId('d1', 0), lineId('d1', 1)],
      verbs: ['v1'],
    });
    expect(unitPracticeItems(bundle, 3)).toEqual({
      read: [],
      write: [],
      speak: [],
      verbs: [],
    });
  });

  it('counts only practised items the unit still offers', () => {
    const record = (id: string) => ({ id }) as PracticeRecord;
    const records = {
      [practiceId(1, 'write', 'w1')]: record('a'),
      [practiceId(1, 'write', 'gone')]: record('b'),
      [practiceId(2, 'write', 'w1')]: record('c'),
    };
    expect(practiceCount(records, 1, 'write', ['w1', 'w3'])).toBe(1);
  });
});
