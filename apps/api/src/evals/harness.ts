/**
 * Eval harness (story 11.3, ADR-0011): runs golden cases against the live prompts and models,
 * stops before the budget is spent, and compares the pass rate with the baseline so a prompt or
 * route change that makes things worse fails CI. Pure: the model call is injected.
 */
import { z } from 'zod';
import { foldArabic } from '../tutor/content.js';
import type { GradeResult } from '../tutor/grading.js';
import { MISTAKE_CATEGORIES } from '../tutor/grading.js';
import { validateAnswer } from '../tutor/validate.js';

export const GradingCase = z.object({
  id: z.string().min(1),
  kind: z.enum(['writing', 'speech']),
  unit: z.number().int().min(1).optional(),
  task: z.string(),
  answer: z.string().min(1),
  /** Inclusive range the score must fall in. */
  score: z.tuple([z.number().min(0).max(100), z.number().min(0).max(100)]),
  mustFlag: z.array(z.enum(MISTAKE_CATEGORIES)).optional(),
  maxMistakes: z.number().int().min(0).optional(),
});
export type GradingCase = z.infer<typeof GradingCase>;

export const TutorCase = z.object({
  id: z.string().min(1),
  unit: z.number().int().min(1).optional(),
  prompt: z.string().min(1),
  /** At least one must appear (compared without vowel marks, case-insensitive). */
  containsAny: z.array(z.string().min(1)).min(1),
});
export type TutorCase = z.infer<typeof TutorCase>;

export const Baseline = z.object({
  grading: z.object({ minPassRate: z.number().min(0).max(1) }),
  tutor: z.object({ minPassRate: z.number().min(0).max(1) }),
});
export type Baseline = z.infer<typeof Baseline>;

export interface CaseResult {
  id: string;
  passed: boolean;
  /** Why it failed (empty when passed). */
  reasons: string[];
  costMicro: number;
}

export interface SuiteReport {
  suite: 'grading' | 'tutor';
  results: CaseResult[];
  /** Cases not run because the budget was spent. */
  skipped: string[];
  spentMicro: number;
  passRate: number;
}

/** Why a grade misses its case (empty: it passes). */
export function checkGrade(c: GradingCase, grade: GradeResult): string[] {
  const reasons: string[] = [];
  const [min, max] = c.score;
  if (grade.score < min || grade.score > max) {
    reasons.push(`score ${grade.score} outside ${min}–${max}`);
  }
  for (const category of c.mustFlag ?? []) {
    if (!grade.mistakes.some((m) => m.category === category)) {
      reasons.push(`no ${category} mistake flagged`);
    }
  }
  if (c.maxMistakes !== undefined && grade.mistakes.length > c.maxMistakes) {
    reasons.push(`${grade.mistakes.length} mistakes, at most ${c.maxMistakes} expected`);
  }
  return reasons;
}

const fold = (text: string) => foldArabic(text).toLowerCase();

/** Why a tutor answer misses its case (empty: it passes). */
export function checkAnswer(c: TutorCase, answer: string): string[] {
  const reasons: string[] = validateAnswer(answer, 'full').map((f) => `validator: ${f}`);
  const text = fold(answer);
  if (!c.containsAny.some((needle) => text.includes(fold(needle)))) {
    reasons.push(`none of ${c.containsAny.join(', ')} in the answer`);
  }
  return reasons;
}

/**
 * Runs cases one by one until the budget would be exceeded: a case starts only while less
 * than the budget has been spent, so a run overshoots by at most one call.
 */
export async function runSuite<C extends { id: string }>(
  suite: SuiteReport['suite'],
  cases: readonly C[],
  run: (c: C) => Promise<{ reasons: string[]; costMicro: number }>,
  budgetMicro: number
): Promise<SuiteReport> {
  const results: CaseResult[] = [];
  const skipped: string[] = [];
  let spent = 0;
  for (const c of cases) {
    if (spent >= budgetMicro) {
      skipped.push(c.id);
      continue;
    }
    let outcome: { reasons: string[]; costMicro: number };
    try {
      outcome = await run(c);
    } catch (error) {
      outcome = { reasons: [`error: ${(error as Error).message}`], costMicro: 0 };
    }
    spent += outcome.costMicro;
    results.push({
      id: c.id,
      passed: outcome.reasons.length === 0,
      reasons: outcome.reasons,
      costMicro: outcome.costMicro,
    });
  }
  const passed = results.filter((r) => r.passed).length;
  return {
    suite,
    results,
    skipped,
    spentMicro: spent,
    passRate: results.length ? passed / results.length : 0,
  };
}

/** Regressions against the baseline; a suite that ran nothing is a regression too. */
export function compare(reports: readonly SuiteReport[], baseline: Baseline): string[] {
  return reports.flatMap((r) => {
    const min = baseline[r.suite].minPassRate;
    if (r.results.length === 0) return [`${r.suite}: no case ran (budget or setup)`];
    return r.passRate < min
      ? [
          `${r.suite}: pass rate ${(r.passRate * 100).toFixed(0)} % below ${(min * 100).toFixed(0)} %`,
        ]
      : [];
  });
}

/** Markdown for the CI job summary. */
export function toMarkdown(
  reports: readonly SuiteReport[],
  regressions: readonly string[]
): string {
  const lines = ['## Suffa evals', ''];
  for (const r of reports) {
    lines.push(
      `### ${r.suite}: ${(r.passRate * 100).toFixed(0)} % passed (${r.results.filter((x) => x.passed).length}/${r.results.length}), $${(r.spentMicro / 1e6).toFixed(4)}`,
      '',
      '| case | result | why |',
      '| --- | --- | --- |',
      ...r.results.map(
        (x) => `| ${x.id} | ${x.passed ? '✅' : '❌'} | ${x.reasons.join('; ')} |`
      ),
      ...r.skipped.map((id) => `| ${id} | ⏭ | budget reached |`),
      ''
    );
  }
  lines.push(
    regressions.length
      ? `**Regressions:** ${regressions.join('; ')}`
      : '**No regressions.**'
  );
  return lines.join('\n');
}
