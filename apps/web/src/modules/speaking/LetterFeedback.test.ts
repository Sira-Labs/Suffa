import { describe, expect, it } from 'vitest';
import { letterSegments } from './LetterFeedback';

describe('letterSegments', () => {
  it('keeps each letter with its marks and starts at the letter', () => {
    expect(letterSegments('كِتَابٌ جَدِيدٌ')).toEqual([
      { start: 0, text: 'كِ' },
      { start: 2, text: 'تَ' },
      { start: 4, text: 'ا' },
      { start: 5, text: 'بٌ' },
      { start: 7, text: ' ' },
      { start: 8, text: 'جَ' },
      { start: 10, text: 'دِ' },
      { start: 12, text: 'ي' },
      { start: 13, text: 'دٌ' },
    ]);
  });

  it('attaches shadda, sukūn and the dagger alif', () => {
    expect(letterSegments('هٰذَا مُدَرِّسٌ').map((s) => s.text)).toEqual([
      'هٰ',
      'ذَ',
      'ا',
      ' ',
      'مُ',
      'دَ',
      'رِّ',
      'سٌ',
    ]);
  });
});
