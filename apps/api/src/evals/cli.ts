/**
 * `npm run eval -w @suffa/api`: runs the golden sets against the real models (story 11.3).
 * Needs SUFFA_EVAL_ANTHROPIC_API_KEY; without it the run is skipped (exit 0). Spends at most
 * SUFFA_EVAL_BUDGET_USD (default 0.50) and exits 1 when a suite falls below the baseline.
 */
import { appendFile, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { AnthropicProvider, ModelRouter, type ModelRoute } from '@suffa/llm';
import { ContentCatalog } from '../tutor/content.js';
import { gradeRequest, gradeTask, parseGrade } from '../tutor/grading.js';
import type { LearnerSnapshot } from '../tutor/learner.js';
import { buildSystem } from '../tutor/prompt.js';
import {
  Baseline,
  checkAnswer,
  checkGrade,
  compare,
  GradingCase,
  runSuite,
  toMarkdown,
  TutorCase,
} from './harness.js';

const here = (path: string) => fileURLToPath(new URL(path, import.meta.url));
const EVALS = here('../../evals/');
const CONTENT = here('../../../web/src/content');

async function json(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, 'utf8'));
}

/** A learner who has reached `unit` (units 1..unit started). */
export function learnerAt(unit: number): LearnerSnapshot {
  return {
    firstName: null,
    tutorLanguage: 'de',
    tashkilLevel: 'full',
    currentUnit: unit,
    enrolledUnits: Array.from({ length: unit }, (_, i) => i + 1),
    cards: { total: 0, due: 0, leeches: 0 },
    troubleWords: [],
    lastExam: null,
  };
}

async function main(): Promise<number> {
  const key = process.env.SUFFA_EVAL_ANTHROPIC_API_KEY;
  if (!key) {
    process.stdout.write('Evals skipped: SUFFA_EVAL_ANTHROPIC_API_KEY is not set.\n');
    return 0;
  }
  const budgetMicro = Math.round(
    Number(process.env.SUFFA_EVAL_BUDGET_USD ?? '0.5') * 1e6
  );
  const catalog = await ContentCatalog.load(CONTENT);
  const routes = (await json(`${EVALS}routes.json`)) as { routes: ModelRoute[] };
  const router = new ModelRouter({
    providers: { anthropic: new AnthropicProvider({ apiKey: key }) },
    source: { load: async () => routes.routes },
  });
  const grading = (
    (await json(`${EVALS}grading.json`)) as { cases: unknown[] }
  ).cases.map((c) => GradingCase.parse(c));
  const tutor = ((await json(`${EVALS}tutor.json`)) as { cases: unknown[] }).cases.map(
    (c) => TutorCase.parse(c)
  );
  const baseline = Baseline.parse(await json(`${EVALS}baseline.json`));

  // Most of the budget goes to grading (more cases, structured output).
  const gradingBudget = Math.round(budgetMicro * 0.6);
  const gradingReport = await runSuite(
    'grading',
    grading,
    async (c) => {
      const result = await router.complete(
        gradeTask(c.kind),
        gradeRequest(catalog, learnerAt(c.unit ?? 1), c)
      );
      return {
        reasons: checkGrade(c, parseGrade(result.text)),
        costMicro: result.costMicroUsd ?? 0,
      };
    },
    gradingBudget
  );
  const tutorReport = await runSuite(
    'tutor',
    tutor,
    async (c) => {
      const result = await router.complete('tutor.converse', {
        system: buildSystem(catalog, learnerAt(c.unit ?? 1), {}),
        messages: [{ role: 'user', content: c.prompt }],
      });
      return {
        reasons: checkAnswer(c, result.text),
        costMicro: result.costMicroUsd ?? 0,
      };
    },
    budgetMicro - gradingReport.spentMicro
  );
  const reports = [gradingReport, tutorReport];
  const regressions = compare(reports, baseline);
  const markdown = toMarkdown(reports, regressions);
  process.stdout.write(`${markdown}\n`);
  if (process.env.GITHUB_STEP_SUMMARY) {
    await appendFile(process.env.GITHUB_STEP_SUMMARY, `${markdown}\n`);
  }
  return regressions.length ? 1 : 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().then(
    (code) => process.exit(code),
    (error: unknown) => {
      console.error(error);
      process.exit(1);
    }
  );
}
