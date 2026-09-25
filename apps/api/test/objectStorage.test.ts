import { describe, expect, it } from 'vitest';
import { isSafeKey, toMediaPath } from '../src/storage/objectStorage.js';

describe('object storage helpers', () => {
  it('turns presigned URLs of the internal endpoint into same-origin /media paths', () => {
    expect(
      toMediaPath(
        'http://srv-captain--rustfs:9000/suffa-media/rec/a.mp4?X-Amz-Signature=abc',
        'http://srv-captain--rustfs:9000'
      )
    ).toBe('/media/suffa-media/rec/a.mp4?X-Amz-Signature=abc');
    expect(() =>
      toMediaPath('https://evil.example/suffa-media/a', 'http://srv-captain--rustfs:9000')
    ).toThrow(/expected/);
  });

  it('accepts only plain relative keys', () => {
    expect(isSafeKey('recordings/2026/abc-123/original.mp4')).toBe(true);
    for (const bad of ['', '/abs', 'a//b', 'a/../b', './a', 'a b', 'x'.repeat(513)]) {
      expect(isSafeKey(bad)).toBe(false);
    }
  });
});
