import { describe, expect, it } from 'vitest';
import { toFixes, transcriptPieces } from '../src/media/proofread.js';

const cues = [
  { start: 0, end: 4, text: 'Heute: Hather Beiton.' },
  { start: 4, end: 8, text: 'Ma hada?' },
  { start: 8, end: 9, text: 'Gut.' },
];

describe('transcriptPieces', () => {
  it('numbers every line by its index', () => {
    expect(transcriptPieces(cues)).toEqual([
      '[0] Heute: Hather Beiton.\n[1] Ma hada?\n[2] Gut.\n',
    ]);
  });

  it('splits long transcripts without cutting a line', () => {
    const long = Array.from({ length: 400 }, (_, i) => ({
      start: i,
      end: i + 1,
      text: 'x'.repeat(50),
    }));
    const pieces = transcriptPieces(long);
    expect(pieces.length).toBeGreaterThan(1);
    expect(pieces.every((p) => p.length <= 8_000)).toBe(true);
    expect(pieces.join('').split('\n').filter(Boolean)).toHaveLength(400);
  });
});

describe('toFixes', () => {
  it('keeps real corrections with Arabic letters and drops the rest', () => {
    expect(
      toFixes(
        {
          fixes: [
            { line: 0, text: 'Heute: هٰذَا بَيْتٌ.' },
            { line: 0, text: 'Heute: هٰذا بيت.' },
            { line: 1, text: '[1] مَا هٰذَا؟' },
            { line: 2, text: 'Gut.' },
            { line: 2, text: 'Sehr gut.' },
            { line: 2, text: 'جَيِّدٌ '.repeat(20) },
            { line: 5, text: 'مَا' },
            { line: -1, text: 'مَا' },
          ],
        },
        cues
      )
    ).toEqual([
      { cue: 0, before: 'Heute: Hather Beiton.', after: 'Heute: هٰذَا بَيْتٌ.' },
      { cue: 1, before: 'Ma hada?', after: 'مَا هٰذَا؟' },
    ]);
  });

  it('rejects an answer of the wrong shape', () => {
    expect(() => toFixes({ lines: [] }, cues)).toThrow();
  });
});
