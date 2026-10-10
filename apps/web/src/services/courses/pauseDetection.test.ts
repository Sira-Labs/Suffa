import { describe, expect, it } from 'vitest';
import { fitSegments, snapToSegment, speechSegments } from './pauseDetection';

const RATE = 1000;

/** A recording: a quiet hum with loud stretches at the given seconds. */
function recording(seconds: number, loud: [number, number][]): Float32Array {
  const samples = new Float32Array(seconds * RATE);
  for (let i = 0; i < samples.length; i++) {
    const t = i / RATE;
    const speaking = loud.some(([a, b]) => t >= a && t < b);
    samples[i] = (speaking ? 0.5 : 0.005) * Math.sin(i * 0.7);
  }
  return samples;
}

describe('pause detection', () => {
  it('finds the stretches of speech between pauses', () => {
    const segments = speechSegments(
      recording(10, [
        [1, 3],
        [3.5, 5],
        [6, 6.05], // a click
        [7, 9],
      ]),
      RATE
    );
    expect(segments).toEqual([
      { start: 1, end: 3 },
      { start: 3.5, end: 5 },
      { start: 7, end: 9 },
    ]);
  });

  it('keeps short breaths inside one stretch', () => {
    const segments = speechSegments(
      recording(6, [
        [1, 2],
        [2.1, 3],
      ]),
      RATE
    );
    expect(segments).toEqual([{ start: 1, end: 3 }]);
  });

  it('finds nothing in silence', () => {
    expect(speechSegments(new Float32Array(5 * RATE), RATE)).toEqual([]);
  });

  it('fits the segments to the number of lines', () => {
    const segments = [
      { start: 0, end: 1 },
      { start: 1.2, end: 2 },
      { start: 4, end: 5 },
    ];
    expect(fitSegments(segments, 2)).toEqual([
      { start: 0, end: 2 },
      { start: 4, end: 5 },
    ]);
    expect(fitSegments(segments, 4)).toEqual([
      { start: 0, end: 0.5 },
      { start: 0.5, end: 1 },
      { start: 1.2, end: 2 },
      { start: 4, end: 5 },
    ]);
    expect(fitSegments(segments, 0)).toEqual([]);
  });

  it('snaps a late tap to the start of its stretch of speech', () => {
    const segments = [
      { start: 1, end: 3 },
      { start: 4, end: 6 },
    ];
    expect(snapToSegment(segments, 4.6)).toBe(4);
    expect(snapToSegment(segments, 2.5)).toBe(2.5);
    expect(snapToSegment([], 2.345)).toBe(2.35);
  });
});
