/**
 * Measuring a pronunciation assessor against a teacher (story 15.5, ADR-0022 §4).
 *
 * Each item is a recording of a vocalised text that a teacher rated 1–5 and marked the wrong
 * letters of. An assessor run gives a score, the letters it flagged and how long and how
 * much it took. The metrics:
 * - Spearman ρ between assessor scores and teacher ratings (do they order items alike?);
 * - precision, recall and F1 of the flagged letters against the teacher's wrong letters;
 * - false rejections: items the teacher accepted (rating ≥ 4, no wrong letter) where the
 *   assessor still called a letter wrong — what hurts motivation most (target ≤ 5 %);
 * - p95 latency and cost, per minute of audio.
 * Pure functions: the assessors and the data live with the caller.
 */
import type { Assessment } from './assess.js';

/** A teacher's verdict on one recording. */
export interface TeacherLabel {
  /** 1 (unintelligible) … 5 (as a teacher would say it). */
  rating: number;
  /** Indices (into the item's text) of the letters the teacher marked wrong. */
  wrong: number[];
}

export interface EvalItem {
  id: string;
  /** The vocalised text the learner read. */
  text: string;
  teacher: TeacherLabel;
}

/** What an assessor said about one item, and what it cost. */
export interface AssessorRun {
  /** 0–1. */
  score: number;
  /** Letters the assessor did not accept (wrong or worth checking). */
  flagged: number[];
  /** Letters it called wrong outright (a verdict, not a hint). */
  wrong: number[];
  latencyMs: number;
  costMicro: number;
  /** Length of the recording (0 when the run used no audio). */
  audioSeconds: number;
}

export interface EvalMetrics {
  items: number;
  /** null with fewer than two items or no spread in either list. */
  spearman: number | null;
  letters: {
    truePositives: number;
    falsePositives: number;
    falseNegatives: number;
    precision: number;
    recall: number;
    f1: number;
  };
  falseRejections: { count: number; accepted: number; rate: number };
  latencyP95Ms: number;
  costMicro: number;
  /** null without audio. */
  costPerMinuteMicro: number | null;
}

/** Thresholds a run must meet; any may be left out. */
export interface EvalBaseline {
  minSpearman?: number;
  minLetterF1?: number;
  maxFalseRejectionRate?: number;
  maxLatencyP95Ms?: number;
  maxCostPerMinuteMicro?: number;
}

export class EvalDataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EvalDataError';
  }
}

/**
 * The indices of marked letters: each mark names a letter and which occurrence it is
 * (1 = first), as a teacher would point at it.
 */
export function resolveMarks(
  text: string,
  marks: ReadonlyArray<{ letter: string; nth?: number }>
): number[] {
  return marks.map(({ letter, nth = 1 }) => {
    let seen = 0;
    for (let i = 0; i < text.length; i++) {
      if (text[i] === letter && ++seen === nth) return i;
    }
    throw new EvalDataError(`"${letter}" #${nth} does not occur in "${text}"`);
  });
}

/** Ranks from 1, ties sharing their average rank. */
function ranks(values: readonly number[]): number[] {
  const order = values.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v);
  const out = new Array<number>(values.length);
  for (let start = 0; start < order.length; ) {
    let end = start;
    while (end + 1 < order.length && order[end + 1]!.v === order[start]!.v) end++;
    const rank = (start + end) / 2 + 1;
    for (let k = start; k <= end; k++) out[order[k]!.i] = rank;
    start = end + 1;
  }
  return out;
}

/** Spearman's rank correlation (Pearson on ranks, ties averaged). */
export function spearman(xs: readonly number[], ys: readonly number[]): number | null {
  if (xs.length !== ys.length) {
    throw new EvalDataError('spearman needs two lists of the same length');
  }
  if (xs.length < 2) return null;
  const rx = ranks(xs);
  const ry = ranks(ys);
  const mean = (r: number[]) => r.reduce((a, b) => a + b, 0) / r.length;
  const mx = mean(rx);
  const my = mean(ry);
  let cov = 0;
  let vx = 0;
  let vy = 0;
  for (let i = 0; i < rx.length; i++) {
    cov += (rx[i]! - mx) * (ry[i]! - my);
    vx += (rx[i]! - mx) ** 2;
    vy += (ry[i]! - my) ** 2;
  }
  return vx === 0 || vy === 0 ? null : cov / Math.sqrt(vx * vy);
}

/** Nearest-rank percentile (p in 0–100); 0 for no values. */
export function percentile(values: readonly number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.max(1, Math.ceil((p / 100) * sorted.length));
  return sorted[rank - 1]!;
}

/** The verdict part of a run from a letter assessment (`assessLetters`). */
export function verdict(
  assessment: Assessment
): Pick<AssessorRun, 'score' | 'flagged' | 'wrong'> {
  return {
    score: assessment.score,
    flagged: assessment.letters.filter((l) => l.status !== 'good').map((l) => l.index),
    wrong: assessment.letters.filter((l) => l.status === 'wrong').map((l) => l.index),
  };
}

/** A teacher accepts an item: good rating and no letter marked. */
export const accepted = (label: TeacherLabel) =>
  label.rating >= 4 && label.wrong.length === 0;

/** The metrics of one assessor over a data set (`runs[i]` belongs to `items[i]`). */
export function evaluate(
  items: readonly EvalItem[],
  runs: readonly AssessorRun[]
): EvalMetrics {
  if (items.length !== runs.length) {
    throw new EvalDataError(`${items.length} items but ${runs.length} runs`);
  }
  let tp = 0;
  let fp = 0;
  let fn = 0;
  let acceptedItems = 0;
  let rejected = 0;
  items.forEach((item, i) => {
    const run = runs[i]!;
    const truth = new Set(item.teacher.wrong);
    const flagged = new Set(run.flagged);
    for (const index of flagged) {
      if (truth.has(index)) tp++;
      else fp++;
    }
    for (const index of truth) if (!flagged.has(index)) fn++;
    if (accepted(item.teacher)) {
      acceptedItems++;
      if (run.wrong.length > 0) rejected++;
    }
  });
  const precision = tp + fp === 0 ? 1 : tp / (tp + fp);
  const recall = tp + fn === 0 ? 1 : tp / (tp + fn);
  const f1 =
    precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
  const costMicro = runs.reduce((sum, r) => sum + r.costMicro, 0);
  const audioMinutes = runs.reduce((sum, r) => sum + r.audioSeconds, 0) / 60;
  return {
    items: items.length,
    spearman: spearman(
      runs.map((r) => r.score),
      items.map((item) => item.teacher.rating)
    ),
    letters: {
      truePositives: tp,
      falsePositives: fp,
      falseNegatives: fn,
      precision,
      recall,
      f1,
    },
    falseRejections: {
      count: rejected,
      accepted: acceptedItems,
      rate: acceptedItems === 0 ? 0 : rejected / acceptedItems,
    },
    latencyP95Ms: percentile(
      runs.map((r) => r.latencyMs),
      95
    ),
    costMicro,
    costPerMinuteMicro: audioMinutes > 0 ? costMicro / audioMinutes : null,
  };
}

/** Where a run misses its baseline (empty: it passes). */
export function regressions(metrics: EvalMetrics, baseline: EvalBaseline): string[] {
  const out: string[] = [];
  const pct = (x: number) => `${Math.round(x * 1000) / 10} %`;
  if (baseline.minSpearman !== undefined) {
    if (metrics.spearman === null) out.push('Spearman ρ cannot be computed');
    else if (metrics.spearman < baseline.minSpearman) {
      out.push(
        `Spearman ρ ${metrics.spearman.toFixed(2)} < ${baseline.minSpearman.toFixed(2)}`
      );
    }
  }
  if (baseline.minLetterF1 !== undefined && metrics.letters.f1 < baseline.minLetterF1) {
    out.push(
      `letter F1 ${metrics.letters.f1.toFixed(2)} < ${baseline.minLetterF1.toFixed(2)}`
    );
  }
  if (
    baseline.maxFalseRejectionRate !== undefined &&
    metrics.falseRejections.rate > baseline.maxFalseRejectionRate
  ) {
    out.push(
      `false rejections ${pct(metrics.falseRejections.rate)} > ${pct(baseline.maxFalseRejectionRate)}`
    );
  }
  if (
    baseline.maxLatencyP95Ms !== undefined &&
    metrics.latencyP95Ms > baseline.maxLatencyP95Ms
  ) {
    out.push(`p95 latency ${metrics.latencyP95Ms} ms > ${baseline.maxLatencyP95Ms} ms`);
  }
  if (
    baseline.maxCostPerMinuteMicro !== undefined &&
    metrics.costPerMinuteMicro !== null &&
    metrics.costPerMinuteMicro > baseline.maxCostPerMinuteMicro
  ) {
    out.push(
      `cost ${Math.round(metrics.costPerMinuteMicro)} µ$/min > ${baseline.maxCostPerMinuteMicro} µ$/min`
    );
  }
  return out;
}
