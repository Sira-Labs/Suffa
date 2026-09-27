import { describe, expect, it } from 'vitest';
import {
  COURSES,
  DEFAULT_COURSE,
  MAX_UNIT,
  courseById,
  courseOfUnit,
  isCourseId,
  unitLabelNumber,
} from '../src/courses.js';
import { BOOK_UNITS } from '../src/units.js';

describe('courses', () => {
  it('keeps the first course on units 1–16, so stored progress stays valid', () => {
    expect(DEFAULT_COURSE).toBe('bayna-yadayk');
    expect(courseById('bayna-yadayk').units).toEqual(
      Array.from({ length: BOOK_UNITS }, (_, i) => i + 1)
    );
  });

  it('gives every course its own unit numbers, never 0 and never above the limit', () => {
    const all = COURSES.flatMap((c) => c.units);
    expect(new Set(all).size).toBe(all.length);
    expect(all.every((u) => u >= 1 && u <= MAX_UNIT)).toBe(true);
  });

  it('finds the course of a unit and its number inside the course', () => {
    expect(courseOfUnit(3)?.id).toBe('bayna-yadayk');
    expect(courseOfUnit(103)?.id).toBe('madinah');
    expect(courseOfUnit(0)).toBeNull();
    expect(courseOfUnit(50)).toBeNull();
    expect(unitLabelNumber(103)).toBe(3);
    expect(unitLabelNumber(3)).toBe(3);
    expect(unitLabelNumber(0)).toBe(0);
  });

  it('checks course ids', () => {
    expect(isCourseId('madinah')).toBe(true);
    expect(isCourseId('klingonisch')).toBe(false);
    expect(isCourseId(1)).toBe(false);
    expect(() => courseById('x' as never)).toThrow();
  });

  it('offers the Medina course with links first, before its own exercises exist', () => {
    expect(courseById('madinah')).toMatchObject({ available: true, exercises: false });
    expect(courseById('bayna-yadayk')).toMatchObject({
      available: true,
      exercises: true,
    });
  });
});
