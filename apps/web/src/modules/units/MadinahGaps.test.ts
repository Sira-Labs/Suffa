import { describe, expect, it } from 'vitest';
import madinahBook1Lessons from '@/content/courses/madinah/book1-lessons.json';
import type { MadinahLessonContent } from '@/services/courses';
import { GAP, gapOptions } from './MadinahGaps';
import { buildLessonTest } from './MadinahLessonTest';

const lessons = madinahBook1Lessons.lessons as MadinahLessonContent[];

describe('Medina gap sentences (own content)', () => {
  it('have exactly one gap, a German meaning and distinct options with the answer', () => {
    for (const lesson of lessons) {
      expect(lesson.gaps.length, `lesson ${lesson.lesson}`).toBeGreaterThanOrEqual(5);
      for (const gap of lesson.gaps) {
        expect(gap.ar.split(GAP), gap.ar).toHaveLength(2);
        expect(gap.de.length).toBeGreaterThan(0);
        expect(gap.options).toContain(gap.answer);
        expect(new Set(gap.options).size).toBe(gap.options.length);
        expect(gap.options.length).toBeGreaterThanOrEqual(2);
      }
    }
  });

  it('keep their options in a stable order', () => {
    const gap = lessons[0]!.gaps[0]!;
    expect(gapOptions(gap, 0)).toEqual(gapOptions(gap, 0));
    expect([...gapOptions(gap, 0)].sort()).toEqual([...gap.options].sort());
  });
});

describe('buildLessonTest', () => {
  it('asks up to six meanings and every gap sentence', () => {
    const lesson = lessons[0]!;
    const seeded = (seed: number) => {
      let n = seed;
      return () => (n = (n * 9301 + 49297) % 233280) / 233280;
    };
    const questions = buildLessonTest(lesson, seeded(1));
    expect(questions.filter((q) => q.kind === 'meaning')).toHaveLength(6);
    expect(questions.filter((q) => q.kind === 'gap')).toHaveLength(lesson.gaps.length);
    for (const q of questions) expect(q.options).toContain(q.expected);
    // Another attempt asks other words.
    const other = buildLessonTest(lesson, seeded(2));
    expect(other.map((q) => q.ref)).not.toEqual(questions.map((q) => q.ref));
  });

  it('asks every word of a short lesson', () => {
    const short = lessons.find((l) => l.words.length <= 6)!;
    const meanings = buildLessonTest(short).filter((q) => q.kind === 'meaning');
    expect(meanings.map((q) => q.ref).sort()).toEqual(
      short.words.map((w) => w.id).sort()
    );
  });
});
