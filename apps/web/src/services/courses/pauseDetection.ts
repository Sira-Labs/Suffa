/**
 * Finds where the author speaks and pauses in a lesson recording: loudness per 20 ms frame,
 * speech above a level set by the recording itself, a pause of at least `minPause` seconds
 * between two stretches of speech. Runs in the admin's browser (archive.org allows CORS); only
 * the seconds are kept.
 */

export interface Segment {
  start: number;
  end: number;
}

export interface PauseOptions {
  frameSeconds?: number;
  /** Shortest silence that separates two segments. */
  minPause?: number;
  /** Shorter stretches of sound are noise (a click, a breath). */
  minSpeech?: number;
}

const DEFAULTS: Required<PauseOptions> = {
  frameSeconds: 0.02,
  minPause: 0.3,
  minSpeech: 0.15,
};

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))]!;
}

const round = (s: number) => Math.round(s * 100) / 100;

/** Speech segments of a mono recording, in order. */
export function speechSegments(
  samples: ArrayLike<number>,
  sampleRate: number,
  options: PauseOptions = {}
): Segment[] {
  const o = { ...DEFAULTS, ...options };
  const frame = Math.max(1, Math.round(sampleRate * o.frameSeconds));
  const frames = Math.floor(samples.length / frame);
  const rms = new Array<number>(frames);
  for (let f = 0; f < frames; f++) {
    let sum = 0;
    for (let i = f * frame; i < (f + 1) * frame; i++) sum += samples[i]! * samples[i]!;
    rms[f] = Math.sqrt(sum / frame);
  }
  const sorted = [...rms].sort((a, b) => a - b);
  const floor = percentile(sorted, 0.1);
  const loud = percentile(sorted, 0.95);
  if (loud - floor < 1e-4) return [];
  const threshold = floor + 0.12 * (loud - floor);

  const segments: Segment[] = [];
  const minPauseFrames = Math.round(o.minPause / o.frameSeconds);
  let start = -1;
  let silent = 0;
  for (let f = 0; f < frames; f++) {
    if (rms[f]! > threshold) {
      if (start < 0) start = f;
      silent = 0;
    } else if (start >= 0) {
      silent++;
      if (silent >= minPauseFrames) {
        segments.push({
          start: start * o.frameSeconds,
          end: (f - silent + 1) * o.frameSeconds,
        });
        start = -1;
        silent = 0;
      }
    }
  }
  if (start >= 0)
    segments.push({
      start: start * o.frameSeconds,
      end: (frames - silent) * o.frameSeconds,
    });

  return segments
    .filter((s) => s.end - s.start >= o.minSpeech)
    .map((s) => ({ start: round(s.start), end: round(s.end) }));
}

/**
 * Exactly `count` time spans from the segments, in order: the closest neighbours are joined
 * while there are too many, the longest span is halved while there are too few.
 */
export function fitSegments(segments: readonly Segment[], count: number): Segment[] {
  if (count <= 0 || segments.length === 0) return [];
  const spans = segments.map((s) => ({ ...s }));
  while (spans.length > count) {
    let best = 0;
    for (let i = 1; i < spans.length - 1; i++) {
      if (
        spans[i + 1]!.start - spans[i]!.end <
        spans[best + 1]!.start - spans[best]!.end
      ) {
        best = i;
      }
    }
    spans.splice(best, 2, { start: spans[best]!.start, end: spans[best + 1]!.end });
  }
  while (spans.length < count) {
    let longest = 0;
    spans.forEach((s, i) => {
      if (s.end - s.start > spans[longest]!.end - spans[longest]!.start) longest = i;
    });
    const s = spans[longest]!;
    const middle = round((s.start + s.end) / 2);
    spans.splice(
      longest,
      1,
      { start: s.start, end: middle },
      { start: middle, end: s.end }
    );
  }
  return spans;
}

/**
 * The start of the stretch of speech a tap belongs to: people tap a moment after a line
 * begins, so a segment that started up to `reach` seconds before the tap is taken.
 */
export function snapToSegment(
  segments: readonly Segment[],
  t: number,
  reach = 1.2
): number {
  let best: number | null = null;
  for (const s of segments) {
    if (s.start > t) break;
    if (t - s.start <= reach) best = s.start;
  }
  return best ?? round(t);
}

/** Decodes a recording (fetched with CORS) to its first channel. */
export async function decodeRecording(
  url: string
): Promise<{ samples: Float32Array; sampleRate: number }> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`recording: HTTP ${response.status}`);
  const data = await response.arrayBuffer();
  const context = new AudioContext();
  try {
    const audio = await context.decodeAudioData(data);
    return { samples: audio.getChannelData(0), sampleRate: audio.sampleRate };
  } finally {
    void context.close();
  }
}
