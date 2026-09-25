/**
 * Transcoding recordings (story 7.4): one small audio file for listening (AAC, mono, plays
 * everywhere incl. iOS) and, for videos, a 720p MP4 with fast start. ffmpeg runs with few
 * threads and low priority, one job at a time, so the shared server (Tabayyun) stays fast.
 */
import { spawn } from 'node:child_process';
import { join } from 'node:path';

export interface Probe {
  durationSec: number;
  hasVideo: boolean;
  hasAudio: boolean;
}

export interface Renditions {
  audio: string;
  video: string | null;
}

/** ffmpeg threads per job (the server is shared). */
export const FFMPEG_THREADS = 2;

function run(
  command: string,
  args: string[],
  onStdout?: (chunk: string) => void
): Promise<string> {
  return new Promise((resolve, reject) => {
    // `nice` keeps interactive services responsive while a long recording is processed.
    const child = spawn('nice', ['-n', '10', command, ...args], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    let err = '';
    child.stdout.setEncoding('utf8').on('data', (chunk: string) => {
      out += chunk;
      onStdout?.(chunk);
    });
    child.stderr.setEncoding('utf8').on('data', (chunk: string) => {
      err = (err + chunk).slice(-4000);
    });
    child.on('error', reject);
    child.on('close', (code) =>
      code === 0
        ? resolve(out)
        : reject(new Error(`${command} exited ${code}: ${err.trim()}`))
    );
  });
}

export async function probe(file: string): Promise<Probe> {
  const out = await run('ffprobe', [
    '-v',
    'error',
    '-show_entries',
    'format=duration:stream=codec_type:stream_disposition=attached_pic',
    '-of',
    'json',
    file,
  ]);
  const data = JSON.parse(out) as {
    format?: { duration?: string };
    streams?: { codec_type?: string; disposition?: { attached_pic?: number } }[];
  };
  const streams = data.streams ?? [];
  return {
    durationSec: Number(data.format?.duration ?? 0),
    // Cover art in an MP3/M4A is a "video" stream with attached_pic; it is not a video.
    hasVideo: streams.some(
      (s) => s.codec_type === 'video' && s.disposition?.attached_pic !== 1
    ),
    hasAudio: streams.some((s) => s.codec_type === 'audio'),
  };
}

/** "out_time_us=12345678" lines from `-progress pipe:1` → percent of the duration. */
export function progressFrom(chunk: string, durationSec: number): number | null {
  const match = /out_time_(?:us|ms)=(\d+)/.exec(chunk.split('\n').reverse().join('\n'));
  if (!match || durationSec <= 0) return null;
  const seconds = Number(match[1]) / 1_000_000;
  return Math.max(0, Math.min(100, Math.round((seconds / durationSec) * 100)));
}

/**
 * Writes `audio.m4a` (and `video.mp4` for videos) into `outDir`. `onProgress` gets 0–100 over
 * both passes.
 */
export async function transcode(
  input: string,
  outDir: string,
  info: Probe,
  onProgress: (percent: number) => void
): Promise<Renditions> {
  if (!info.hasAudio) throw new Error('the recording has no audio track');
  const passes = info.hasVideo ? 2 : 1;
  const report = (pass: number) => (chunk: string) => {
    const p = progressFrom(chunk, info.durationSec);
    if (p !== null) onProgress(Math.round((pass * 100 + p) / passes));
  };
  const common = ['-hide_banner', '-nostdin', '-y', '-threads', String(FFMPEG_THREADS)];
  const audio = join(outDir, 'audio.m4a');
  await run(
    'ffmpeg',
    [
      ...common,
      '-i',
      input,
      '-vn',
      '-ac',
      '1',
      '-c:a',
      'aac',
      '-b:a',
      '64k',
      '-movflags',
      '+faststart',
      '-progress',
      'pipe:1',
      audio,
    ],
    report(0)
  );
  let video: string | null = null;
  if (info.hasVideo) {
    video = join(outDir, 'video.mp4');
    await run(
      'ffmpeg',
      [
        ...common,
        '-i',
        input,
        '-vf',
        "scale=-2:'min(720,ih)'",
        '-c:v',
        'libx264',
        '-preset',
        'veryfast',
        '-crf',
        '26',
        '-pix_fmt',
        'yuv420p',
        '-c:a',
        'aac',
        '-b:a',
        '96k',
        '-movflags',
        '+faststart',
        '-progress',
        'pipe:1',
        video,
      ],
      report(1)
    );
  }
  onProgress(100);
  return { audio, video };
}
