import { describe, expect, it } from 'vitest';
import {
  ALL_LETTERS,
  ALPHABET_LESSONS,
  lessonItems,
  letterForms,
  parseItem,
} from './alphabet';

describe('alphabet course', () => {
  it('teaches all 28 letters plus ة and ء, each once', () => {
    const letters = ALPHABET_LESSONS.slice(0, 7).flatMap((l) =>
      l.letters.map((x) => x.char)
    );
    expect(new Set(letters).size).toBe(letters.length);
    expect(letters).toHaveLength(30);
    for (const c of 'ابتثجحخدذرزسشصضطظعغفقكلمنهوي') expect(letters).toContain(c);
    expect(new Set(ALL_LETTERS.map((l) => l.id)).size).toBe(ALL_LETTERS.length);
  });

  it('writes positional forms with tatweel; non-connectors join only from the right', () => {
    const ba = ALL_LETTERS.find((l) => l.id === 'ba')!;
    expect(letterForms(ba).map((f) => f.text)).toEqual(['ب', 'بـ', 'ـبـ', 'ـب']);
    const dal = ALL_LETTERS.find((l) => l.id === 'dal')!;
    expect(letterForms(dal).map((f) => f.text)).toEqual(['د', 'د', 'ـد', 'ـد']);
    const fatha = ALL_LETTERS.find((l) => l.id === 'fatha')!;
    expect(letterForms(fatha)).toHaveLength(1);
  });

  it('asks to recognise and to find every letter of a lesson', () => {
    const lesson = ALPHABET_LESSONS[1]!;
    const items = lessonItems(lesson);
    expect(items).toHaveLength(lesson.letters.length * 2);
    expect(parseItem(items[0]!)).toMatchObject({
      kind: 'see',
      letter: lesson.letters[0],
    });
    expect(parseItem('nope:ba')).toBeNull();
  });
});
