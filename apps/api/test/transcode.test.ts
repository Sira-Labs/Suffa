import { execFileSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  canCopyVideo,
  probe,
  progressFrom,
  transcode,
  videoStreamArgs,
  type Probe,
} from '../src/media/transcode.js';

const hasFfmpeg = (() => {
  try {
    execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
})();

const zoom: Probe = {
  durationSec: 60,
  hasVideo: true,
  hasAudio: true,
  video: { codec: 'h264', height: 720, pixFmt: 'yuv420p' },
  audioCodec: 'aac',
};

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

describe('video rendition', () => {
  it('copies H.264 up to 720p (Zoom, most phones) instead of re-encoding', () => {
    expect(canCopyVideo(zoom)).toBe(true);
    expect(videoStreamArgs(zoom)).toEqual([
      '-map',
      '0:V:0',
      '-map',
      '0:a:0',
      '-c:v',
      'copy',
      '-c:a',
      'copy',
    ]);
  });

  it('re-encodes 1080p, HEVC and 10-bit video, and non-AAC audio', () => {
    for (const video of [
      { codec: 'h264', height: 1080, pixFmt: 'yuv420p' },
      { codec: 'hevc', height: 720, pixFmt: 'yuv420p' },
      { codec: 'h264', height: 720, pixFmt: 'yuv420p10le' },
    ]) {
      expect(canCopyVideo({ ...zoom, video })).toBe(false);
      expect(videoStreamArgs({ ...zoom, video })).toContain('libx264');
    }
    expect(videoStreamArgs({ ...zoom, audioCodec: 'opus' })).toEqual(
      expect.arrayContaining(['-c:v', 'copy', '-c:a', 'aac'])
    );
  });

  it.skipIf(!hasFfmpeg)(
    'turns a Zoom-like MP4 into a fast-start copy with the same video stream',
    async () => {
      const dir = await mkdtemp(join(tmpdir(), 'suffa-transcode-'));
      const input = join(dir, 'zoom.mp4');
      execFileSync('ffmpeg', [
        '-hide_banner',
        '-loglevel',
        'error',
        '-f',
        'lavfi',
        '-i',
        'testsrc=size=640x360:rate=25:duration=3',
        '-f',
        'lavfi',
        '-i',
        'sine=frequency=440:duration=3',
        '-c:v',
        'libx264',
        '-pix_fmt',
        'yuv420p',
        '-c:a',
        'aac',
        input,
      ]);
      try {
        const info = await probe(input);
        expect(info.video).toEqual({ codec: 'h264', height: 360, pixFmt: 'yuv420p' });
        expect(info.audioCodec).toBe('aac');
        const out = await transcode(input, dir, info, () => undefined);
        const result = await probe(out.video!);
        expect(result.video).toEqual(info.video);
        expect(Math.round(result.durationSec)).toBe(3);
      } finally {
        await rm(dir, { recursive: true });
      }
    },
    60_000
  );
});
