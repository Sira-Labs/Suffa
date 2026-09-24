import { describe, expect, it } from 'vitest';
import { content } from '@/content';
import { dialogueSections, tokenStems, wordOccurs } from './sections';

describe('wordOccurs', () => {
  it('finds a word with article, clitics and harakat', () => {
    expect(wordOccurs('طالِب', 'أَنا طالِبٌ جَديدٌ.')).toBe(true);
    expect(wordOccurs('الْبَيْت', 'هٰذا بَيْتي.')).toBe(true);
    expect(wordOccurs('غُرْفَة', 'هٰذِهِ غُرْفَتي.')).toBe(true);
    expect(wordOccurs('كِتاب', 'أَنا طالِبٌ.')).toBe(false);
  });

  it('matches phrases as a whole', () => {
    expect(wordOccurs('صَباحُ الْخَيْر', 'صَباحُ الْخَيْرِ يا عَلِيُّ')).toBe(true);
  });

  it('strips clitics to candidate stems', () => {
    expect(tokenStems('والكتاب')).toContain('كتاب');
  });
});

describe('dialogueSections', () => {
  it('gives every own dialogue a section and every word exactly one', () => {
    for (let unit = 1; unit <= 16; unit++) {
      const sections = dialogueSections(content, unit);
      const dialogues = content.dialoge.filter((d) => d.einheit === unit);
      expect(sections).toHaveLength(dialogues.length);
      const words = content.vokabeln.filter((v) => v.einheit === unit).map((v) => v.id);
      const placed = sections.flatMap((s) => s.wordIds);
      expect([...placed].sort()).toEqual([...words].sort());
    }
  });

  it('puts a word into the first dialogue that uses it', () => {
    const [first] = dialogueSections(content, 1);
    const dialogue = content.dialoge.find((d) => d.id === first!.dialogId)!;
    const text = dialogue.zeilen.map((z) => z.ar).join(' ');
    const used = content.vokabeln.filter(
      (v) => v.einheit === 1 && wordOccurs(v.ar, text)
    );
    expect(used.length).toBeGreaterThan(0);
    for (const word of used) expect(first!.wordIds).toContain(word.id);
  });

  it('keeps sections about the same size', () => {
    for (let unit = 1; unit <= 16; unit++) {
      const sizes = dialogueSections(content, unit).map((s) => s.wordIds.length);
      expect(Math.max(...sizes) - Math.min(...sizes)).toBeLessThanOrEqual(3);
    }
  });

  it('lists the dialogue lines for speaking', () => {
    const [first] = dialogueSections(content, 1);
    expect(first!.lineIds[0]).toBe(`${first!.dialogId}#0`);
  });
});
