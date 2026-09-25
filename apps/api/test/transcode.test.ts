import { describe, expect, it } from 'vitest';
import { progressFrom } from '../src/media/transcode.js';

describe('transcode progress', () => {
  it('reads the latest position from ffmpeg progress output', () => {
    const chunk =
      'frame=10\nout_time_us=1000000\nprogress=continue\nout_time_us=30000000\n';
    expect(progressFrom(chunk, 60)).toBe(50);
    expect(progressFrom('out_time_ms=90000000\n', 60)).toBe(100);
    expect(progressFrom('progress=continue\n', 60)).toBeNull();
    expect(progressFrom('out_time_us=1\n', 0)).toBeNull();
  });
});
