import { describe, expect, it } from 'vitest';
import { content } from '@/content';
import examples from '@/content/sources/examples.json';
import type { ExampleCatalog } from '@/types';
import { clozeChoices, clozeFor, clozeWordIds, CLOZE_CHOICES } from './cloze';

const catalog = examples as ExampleCatalog;

describe('cloze', () => {
  it('blanks the word in its sentence and keeps punctuation outside the gap', () => {
    const task = clozeFor({ id: 'w', ar: 'اِسْم' }, [
      { ar: 'ما اِسْمُكَ؟', de: 'Wie heißt du?', quelle: 'suffa', deVon: 'suffa' },
    ])!;
    expect(task).toMatchObject({
      before: 'ما ',
      gap: 'اِسْمُكَ',
      after: '؟',
      de: 'Wie heißt du?',
    });
  });

  it('finds the word with its article and skips phrases', () => {
    const sentence = {
      ar: 'ذَهَبْتُ إِلى الْمَدْرَسَةِ.',
      de: 'x',
      quelle: 'suffa',
      deVon: 'suffa',
    } as const;
    expect(clozeFor({ id: 'w', ar: 'مَدْرَسَة' }, [sentence])?.gap).toBe('الْمَدْرَسَةِ');
    expect(clozeFor({ id: 'p', ar: 'صَباحُ الْخَيْر' }, [sentence])).toBeNull();
  });

  it('has a task for almost every word of the book', () => {
    const ids = clozeWordIds(content.vokabeln, catalog.examples);
    expect(ids.size / content.vokabeln.length).toBeGreaterThan(0.95);
  });

  it('offers the word among three distractors, in a stable order', () => {
    const pool = ['a', 'b', 'c', 'd', 'e'].map((id) => ({ id }));
    const choices = clozeChoices(pool[0]!, pool);
    expect(choices).toHaveLength(CLOZE_CHOICES);
    expect(choices.map((c) => c.id)).toContain('a');
    expect(clozeChoices(pool[0]!, pool)).toEqual(choices);
  });
});
