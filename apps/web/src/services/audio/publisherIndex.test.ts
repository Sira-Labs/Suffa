import { describe, expect, it } from 'vitest';
import { LESSON_SIZES } from '@suffa/engagement';
import { lessonSizes, loadPublisherIndex } from './publisherIndex';

describe('lesson sizes', () => {
  it('match the audio index (the server pays lesson bonuses from the shared table)', async () => {
    expect(new Map(LESSON_SIZES)).toEqual(lessonSizes(await loadPublisherIndex()));
  });
});
