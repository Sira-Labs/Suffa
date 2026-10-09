import { describe, expect, it } from 'vitest';
import {
  assessLetters,
  evaluate,
  EvalDataError,
  percentile,
  regressions,
  resolveMarks,
  spearman,
  verdict,
  type AssessorRun,
  type EvalItem,
} from '../src/index.js';

const run = (over: Partial<AssessorRun> = {}): AssessorRun => ({
  score: 1,
  flagged: [],
  wrong: [],
  latencyMs: 10,
  costMicro: 0,
  audioSeconds: 0,
  ...over,
});

describe('resolveMarks', () => {
  it('finds the nth occurrence of a letter', () => {
    // ح is at 0, the second ب at 5.
    expect(resolveMarks('حَبِيبٌ', [{ letter: 'ح' }, { letter: 'ب', nth: 2 }])).toEqual([
      0, 5,
    ]);
  });

  it('rejects marks that are not in the text', () => {
    expect(() => resolveMarks('حَبِيبٌ', [{ letter: 'ع' }])).toThrow(EvalDataError);
    expect(() => resolveMarks('حَبِيبٌ', [{ letter: 'ب', nth: 3 }])).toThrow(/#3/);
  });
});

describe('spearman', () => {
  it('is 1 for the same order and -1 for the reverse', () => {
    expect(spearman([0.1, 0.5, 0.9], [1, 3, 5])).toBeCloseTo(1);
    expect(spearman([0.9, 0.5, 0.1], [1, 3, 5])).toBeCloseTo(-1);
  });

  it('averages the ranks of ties', () => {
    // x ranks 1.5, 1.5, 3; y ranks 1, 2, 3.
    expect(spearman([0.2, 0.2, 0.9], [1, 2, 5])).toBeCloseTo(0.866, 3);
  });

  it('has no value without two items or without spread', () => {
    expect(spearman([0.5], [3])).toBeNull();
    expect(spearman([0.5, 0.5], [1, 5])).toBeNull();
    expect(spearman([0.1, 0.9], [4, 4])).toBeNull();
  });

  it('needs lists of the same length', () => {
    expect(() => spearman([1], [1, 2])).toThrow(EvalDataError);
  });
});

describe('percentile', () => {
  it('takes the nearest rank', () => {
    const values = Array.from({ length: 20 }, (_, i) => (i + 1) * 100);
    expect(percentile(values, 95)).toBe(1900);
    expect(percentile([300, 100, 200], 50)).toBe(200);
    expect(percentile([5], 0)).toBe(5);
    expect(percentile([], 95)).toBe(0);
  });
});

describe('verdict', () => {
  it('flags every letter not heard as written, and names the confused ones wrong', () => {
    // ح heard as ه (a typical confusion → wrong), ب missing (→ check).
    const text = 'حَبِيبٌ';
    const v = verdict(assessLetters(text, 'هبي'));
    expect(v.wrong).toEqual([0]);
    expect(v.flagged).toEqual([0, 5]);
    expect(v.score).toBeLessThan(1);
  });
});

describe('evaluate', () => {
  const items: EvalItem[] = [
    { id: 'a', text: 'x', teacher: { rating: 5, wrong: [] } },
    { id: 'b', text: 'x', teacher: { rating: 2, wrong: [0, 2] } },
    { id: 'c', text: 'x', teacher: { rating: 4, wrong: [] } },
    { id: 'd', text: 'x', teacher: { rating: 3, wrong: [4] } },
  ];

  it('scores letters, false rejections, latency and cost', () => {
    const metrics = evaluate(items, [
      run({ score: 0.95, latencyMs: 800, costMicro: 100, audioSeconds: 3 }),
      run({
        score: 0.4,
        flagged: [0, 1],
        wrong: [0],
        latencyMs: 1200,
        costMicro: 100,
        audioSeconds: 3,
      }),
      // The teacher accepted it, the assessor called a letter wrong: a false rejection.
      run({
        score: 0.7,
        flagged: [3],
        wrong: [3],
        latencyMs: 900,
        costMicro: 100,
        audioSeconds: 3,
      }),
      run({ score: 0.6, flagged: [4], latencyMs: 2500, costMicro: 100, audioSeconds: 3 }),
    ]);
    expect(metrics.items).toBe(4);
    expect(metrics.spearman).toBeCloseTo(1);
    expect(metrics.letters).toMatchObject({
      truePositives: 2,
      falsePositives: 2,
      falseNegatives: 1,
      precision: 0.5,
    });
    expect(metrics.letters.recall).toBeCloseTo(2 / 3);
    expect(metrics.letters.f1).toBeCloseTo(4 / 7);
    expect(metrics.falseRejections).toEqual({ count: 1, accepted: 2, rate: 0.5 });
    expect(metrics.latencyP95Ms).toBe(2500);
    expect(metrics.costMicro).toBe(400);
    // 400 µ$ for 12 s of audio = 2000 µ$ per minute.
    expect(metrics.costPerMinuteMicro).toBeCloseTo(2000);
  });

  it('handles a set without wrong letters, accepted items or audio', () => {
    const clean = evaluate(
      [{ id: 'a', text: 'x', teacher: { rating: 3, wrong: [] } }],
      [run()]
    );
    expect(clean.letters).toMatchObject({ precision: 1, recall: 1, f1: 1 });
    expect(clean.falseRejections.rate).toBe(0);
    expect(clean.costPerMinuteMicro).toBeNull();
    expect(clean.spearman).toBeNull();

    const missed = evaluate(
      [{ id: 'b', text: 'x', teacher: { rating: 1, wrong: [0] } }],
      [run({ flagged: [1] })]
    );
    expect(missed.letters).toMatchObject({ precision: 0, recall: 0, f1: 0 });
  });

  it('needs one run per item', () => {
    expect(() => evaluate(items, [run()])).toThrow(EvalDataError);
  });
});

describe('regressions', () => {
  const metrics = evaluate(
    [
      { id: 'a', text: 'x', teacher: { rating: 5, wrong: [] } },
      { id: 'b', text: 'x', teacher: { rating: 2, wrong: [0] } },
    ],
    [
      run({
        score: 0.9,
        wrong: [1],
        flagged: [1],
        latencyMs: 4000,
        costMicro: 600,
        audioSeconds: 6,
      }),
      run({
        score: 0.3,
        flagged: [0],
        wrong: [0],
        latencyMs: 1000,
        costMicro: 600,
        audioSeconds: 6,
      }),
    ]
  );

  it('passes a run that meets every threshold', () => {
    expect(regressions(metrics, { minSpearman: 0.5, maxLatencyP95Ms: 5000 })).toEqual([]);
    expect(regressions(metrics, {})).toEqual([]);
  });

  it('names every threshold the run misses', () => {
    expect(
      regressions(metrics, {
        minSpearman: 1.5,
        minLetterF1: 0.9,
        maxFalseRejectionRate: 0.05,
        maxLatencyP95Ms: 3000,
        maxCostPerMinuteMicro: 1000,
      })
    ).toEqual([
      'Spearman ρ 1.00 < 1.50',
      'letter F1 0.67 < 0.90',
      'false rejections 100 % > 5 %',
      'p95 latency 4000 ms > 3000 ms',
      'cost 6000 µ$/min > 1000 µ$/min',
    ]);
  });

  it('cannot judge a correlation that has no value, and skips cost without audio', () => {
    const flat = evaluate(
      [{ id: 'a', text: 'x', teacher: { rating: 5, wrong: [] } }],
      [run()]
    );
    expect(regressions(flat, { minSpearman: 0.5, maxCostPerMinuteMicro: 1 })).toEqual([
      'Spearman ρ cannot be computed',
    ]);
  });
});
