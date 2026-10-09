/**
 * Pronunciation eval (story 15.5, ADR-0022 §4): runs an assessor over a data set a teacher
 * rated and compares it with the teacher (`evaluate` from @suffa/phonology).
 *
 * A data set is a JSON file with cases: the vocalised text, the teacher's rating (1–5) and the
 * letters they marked wrong, and either
 * - `transcript`: what a recogniser heard (the fixture set in the repository), or
 * - `audio`: a recording next to the file (the consented pilot data, never in the repository).
 * Two assessors: `transcriptAssessor` rates the stored transcript (no cost, runs in CI);
 * `asrAssessor` sends the audio to the speech recogniser as the server does and measures
 * latency and cost.
 */
import { readFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative } from 'node:path';
import {
  assessLetters,
  evaluate,
  regressions,
  resolveMarks,
  verdict,
  type AssessorRun,
  type EvalBaseline,
  type EvalItem,
  type EvalMetrics,
} from '@suffa/phonology';
import { z } from 'zod';
import { clipExtension } from '../media/transcribe.js';

const Mark = z.object({
  letter: z.string().length(1),
  nth: z.number().int().min(1).optional(),
});

export const PronunciationCase = z
  .object({
    id: z.string().min(1),
    text: z.string().min(1).max(300),
    transcript: z.string().optional(),
    /** File name relative to the data set (pilot recordings). */
    audio: z.string().min(1).optional(),
    durationSeconds: z.number().min(0).optional(),
    teacher: z.object({
      rating: z.number().int().min(1).max(5),
      wrong: z.array(Mark),
    }),
  })
  .refine((c) => c.transcript !== undefined || c.audio !== undefined, {
    message: 'a case needs a transcript or an audio file',
  });
export type PronunciationCase = z.infer<typeof PronunciationCase>;

export const PronunciationSet = z.object({
  about: z.string().optional(),
  cases: z.array(PronunciationCase).min(1),
});

export const PronunciationBaseline = z.object({
  about: z.string().optional(),
  minSpearman: z.number().min(-1).max(1).optional(),
  minLetterF1: z.number().min(0).max(1).optional(),
  maxFalseRejectionRate: z.number().min(0).max(1).optional(),
  maxLatencyP95Ms: z.number().min(0).optional(),
  maxCostPerMinuteMicro: z.number().min(0).optional(),
});

export interface LoadedCase extends PronunciationCase {
  /** Absolute path of the recording, if any. */
  audioPath?: string;
}

/** Reads and checks a data set; audio paths must stay inside its folder. */
export async function loadSet(path: string): Promise<LoadedCase[]> {
  const parsed = PronunciationSet.parse(JSON.parse(await readFile(path, 'utf8')));
  const folder = dirname(path);
  return parsed.cases.map((c) => {
    if (!c.audio) return c;
    const audioPath = join(folder, c.audio);
    const inside = relative(folder, audioPath);
    if (inside.startsWith('..') || isAbsolute(inside)) {
      throw new Error(`case ${c.id}: audio must stay inside the data set folder`);
    }
    return { ...c, audioPath };
  });
}

/** The teacher's labels as eval items (marks resolved to letter indices). */
export function toItems(cases: readonly PronunciationCase[]): EvalItem[] {
  return cases.map((c) => ({
    id: c.id,
    text: c.text,
    teacher: { rating: c.teacher.rating, wrong: resolveMarks(c.text, c.teacher.wrong) },
  }));
}

export interface PronunciationAssessor {
  name: string;
  run(c: LoadedCase): Promise<AssessorRun>;
}

const timed = async <T>(work: () => Promise<T>) => {
  const start = performance.now();
  const value = await work();
  return { value, ms: Math.round(performance.now() - start) };
};

/** Rates the stored transcript, as the server would rate what the recogniser heard. */
export const transcriptAssessor: PronunciationAssessor = {
  name: 'transcript (fixtures)',
  async run(c) {
    if (c.transcript === undefined) throw new Error(`case ${c.id} has no transcript`);
    const transcript = c.transcript;
    const { value, ms } = await timed(async () => assessLetters(c.text, transcript));
    return {
      ...verdict(value),
      latencyMs: ms,
      costMicro: 0,
      audioSeconds: c.durationSeconds ?? 0,
    };
  },
};

/**
 * Sends the recording to the speech recogniser (as `POST /speech/assess` does) and rates the
 * result. Latency covers the recogniser and the rating; cost is `pricePerMinuteMicro` per
 * minute of audio (the provider's list price, set by the caller).
 */
export function asrAssessor(
  transcribe: (clip: { bytes: Uint8Array; mimeType: string }) => Promise<string>,
  pricePerMinuteMicro: number,
  read: (path: string) => Promise<Uint8Array> = async (path) =>
    new Uint8Array(await readFile(path))
): PronunciationAssessor {
  return {
    name: 'speech recogniser',
    async run(c) {
      if (!c.audioPath) throw new Error(`case ${c.id} has no audio`);
      if (c.durationSeconds === undefined) {
        throw new Error(
          `case ${c.id}: durationSeconds is needed for the cost per minute`
        );
      }
      const extension = c.audioPath.split('.').pop()!.toLowerCase();
      const mimeType = MIME_TYPES[extension];
      if (!mimeType || !clipExtension(mimeType)) {
        throw new Error(`case ${c.id}: unsupported audio type .${extension}`);
      }
      const bytes = await read(c.audioPath);
      const { value, ms } = await timed(async () =>
        assessLetters(c.text, await transcribe({ bytes, mimeType }))
      );
      return {
        ...verdict(value),
        latencyMs: ms,
        costMicro: (pricePerMinuteMicro * c.durationSeconds) / 60,
        audioSeconds: c.durationSeconds,
      };
    },
  };
}

const MIME_TYPES: Readonly<Record<string, string>> = {
  webm: 'audio/webm',
  ogg: 'audio/ogg',
  m4a: 'audio/mp4',
  mp4: 'audio/mp4',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  aac: 'audio/aac',
};

export interface PronunciationReport {
  assessor: string;
  metrics: EvalMetrics;
  regressions: string[];
  /** Per case: what the assessor and the teacher said (for reading the report). */
  cases: { id: string; score: number; rating: number; flagged: number; marked: number }[];
}

/** Runs one assessor over the cases, one at a time (the recogniser is rate-limited). */
export async function runPronunciationEval(
  cases: readonly LoadedCase[],
  assessor: PronunciationAssessor,
  baseline: EvalBaseline
): Promise<PronunciationReport> {
  const items = toItems(cases);
  const runs: AssessorRun[] = [];
  for (const c of cases) runs.push(await assessor.run(c));
  const metrics = evaluate(items, runs);
  return {
    assessor: assessor.name,
    metrics,
    regressions: regressions(metrics, baseline),
    cases: items.map((item, i) => ({
      id: item.id,
      score: runs[i]!.score,
      rating: item.teacher.rating,
      flagged: runs[i]!.flagged.length,
      marked: item.teacher.wrong.length,
    })),
  };
}

const pct = (x: number) => `${Math.round(x * 1000) / 10} %`;

/** The report as Markdown (CI step summary). */
export function pronunciationMarkdown(report: PronunciationReport): string {
  const m = report.metrics;
  const lines = [
    `## Pronunciation eval: ${report.assessor}`,
    '',
    '| Metric | Value |',
    '| --- | --- |',
    `| Items | ${m.items} |`,
    `| Spearman ρ (score vs. teacher rating) | ${m.spearman === null ? '–' : m.spearman.toFixed(2)} |`,
    `| Wrong letters: precision / recall / F1 | ${m.letters.precision.toFixed(2)} / ${m.letters.recall.toFixed(2)} / ${m.letters.f1.toFixed(2)} |`,
    `| False rejections | ${m.falseRejections.count} of ${m.falseRejections.accepted} accepted (${pct(m.falseRejections.rate)}) |`,
    `| Latency p95 | ${m.latencyP95Ms} ms |`,
    `| Cost | ${(m.costMicro / 1e6).toFixed(4)} $${m.costPerMinuteMicro === null ? '' : ` (${(m.costPerMinuteMicro / 1e6).toFixed(4)} $/min)`} |`,
    '',
    report.regressions.length
      ? `**Below the baseline:** ${report.regressions.join('; ')}`
      : 'Meets the baseline.',
  ];
  return lines.join('\n');
}
