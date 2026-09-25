/** The eval harness itself (story 11.3): checks, budget stop, regressions, golden files. */
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { learnerAt } from '../src/evals/cli.js';
import {
  Baseline,
  checkAnswer,
  checkGrade,
  compare,
  GradingCase,
  runSuite,
  toMarkdown,
  TutorCase,
  type SuiteReport,
} from '../src/evals/harness.js';
import { importCases } from '../src/evals/import.js';

const evals = (name: string) =>
  fileURLToPath(new URL(`../evals/${name}`, import.meta.url));
const read = async (name: string) => JSON.parse(await readFile(evals(name), 'utf8'));

const grade = (score: number, categories: string[] = []) => ({
  score,
  rubric: { task: 3, grammar: 3, vocabulary: 3, spelling: 3 },
  summary: '',
  corrected: '',
  mistakes: categories.map((category) => ({
    original: 'x',
    correction: 'y',
    category: category as 'grammar',
    explanation: '',
  })),
});

describe('golden sets', () => {
  it('are valid and have unique ids', async () => {
    const grading = (await read('grading.json')).cases.map((c: unknown) =>
      GradingCase.parse(c)
    );
    const tutor = (await read('tutor.json')).cases.map((c: unknown) =>
      TutorCase.parse(c)
    );
    Baseline.parse(await read('baseline.json'));
    for (const set of [grading, tutor]) {
      const ids = set.map((c: { id: string }) => c.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
    for (const c of grading) expect(c.score[0]).toBeLessThanOrEqual(c.score[1]);
    const routes = (await read('routes.json')).routes as { task: string }[];
    expect(routes.map((r) => r.task).sort()).toEqual([
      'grade.speech',
      'grade.writing',
      'tutor.converse',
    ]);
  });
});

describe('checks', () => {
  const c = GradingCase.parse({
    id: 'g',
    kind: 'writing',
    task: '',
    answer: 'هذا مدرسة',
    score: [0, 60],
    mustFlag: ['grammar'],
    maxMistakes: 1,
  });

  it('passes a grade in range with the expected mistake', () => {
    expect(checkGrade(c, grade(40, ['grammar']))).toEqual([]);
  });

  it('names every miss', () => {
    expect(checkGrade(c, grade(90, ['spelling', 'spelling']))).toEqual([
      'score 90 outside 0–60',
      'no grammar mistake flagged',
      '2 mistakes, at most 1 expected',
    ]);
  });

  it('checks tutor answers with the validators and expected forms', () => {
    const t = TutorCase.parse({
      id: 't',
      prompt: 'x',
      containsAny: ['مدرسة', 'Lehrkraft'],
    });
    expect(checkAnswer(t, 'Das heißt مَدْرَسَةٌ.')).toEqual([]);
    expect(checkAnswer(t, 'Frag deine lehrkraft.')).toEqual([]);
    expect(checkAnswer(t, 'Musik ist haram.')).toEqual([
      'validator: ruling',
      'none of مدرسة, Lehrkraft in the answer',
    ]);
  });
});

describe('runSuite', () => {
  it('stops starting cases once the budget is spent and records errors as failures', async () => {
    const cases = ['a', 'b', 'c', 'd'].map((id) => ({ id }));
    const report = await runSuite(
      'grading',
      cases,
      async (x) => {
        if (x.id === 'b') throw new Error('overloaded');
        return { reasons: x.id === 'c' ? ['score 90 outside 0–60'] : [], costMicro: 600 };
      },
      1000
    );
    expect(report.results.map((r) => [r.id, r.passed])).toEqual([
      ['a', true],
      ['b', false],
      ['c', false],
    ]);
    expect(report.results[1]!.reasons).toEqual(['error: overloaded']);
    expect(report.skipped).toEqual(['d']);
    expect(report.spentMicro).toBe(1200);
    expect(report.passRate).toBeCloseTo(1 / 3);
  });
});

describe('compare and report', () => {
  const baseline = Baseline.parse({
    grading: { minPassRate: 0.75 },
    tutor: { minPassRate: 0.8 },
  });
  const report = (
    suite: SuiteReport['suite'],
    passed: number,
    total: number
  ): SuiteReport => ({
    suite,
    results: Array.from({ length: total }, (_, i) => ({
      id: `${suite}-${i}`,
      passed: i < passed,
      reasons: i < passed ? [] : ['score 90 outside 0–60'],
      costMicro: 100,
    })),
    skipped: [],
    spentMicro: total * 100,
    passRate: total ? passed / total : 0,
  });

  it('fails a suite below its minimum, and one that ran nothing', () => {
    expect(compare([report('grading', 8, 10), report('tutor', 5, 5)], baseline)).toEqual(
      []
    );
    expect(compare([report('grading', 7, 10), report('tutor', 0, 0)], baseline)).toEqual([
      'grading: pass rate 70 % below 75 %',
      'tutor: no case ran (budget or setup)',
    ]);
  });

  it('writes a markdown summary', () => {
    const md = toMarkdown([{ ...report('tutor', 1, 2), skipped: ['late'] }], ['x']);
    expect(md).toContain('### tutor: 50 % passed (1/2), $0.0002');
    expect(md).toContain('| tutor-1 | ❌ | score 90 outside 0–60 |');
    expect(md).toContain('| late | ⏭ | budget reached |');
    expect(md).toContain('**Regressions:** x');
    expect(toMarkdown([], [])).toContain('**No regressions.**');
  });
});

describe('teacher export import', () => {
  it('adds new reviewed grades with a ±10 range, once', () => {
    const existing = [
      GradingCase.parse({
        id: 'old',
        kind: 'writing',
        task: 'T',
        answer: 'A',
        score: [0, 10],
      }),
    ];
    const added = importCases(existing, {
      cases: [
        { kind: 'writing', task: 'T', answer: 'A', expectedScore: 50, modelScore: 40 },
        { kind: 'speech', task: 'T2', answer: 'B', expectedScore: 95, modelScore: 60 },
      ],
    });
    expect(added).toHaveLength(1);
    expect(added[0]).toMatchObject({ kind: 'speech', score: [85, 100] });
    expect(added[0]!.id).toMatch(/^teacher-[0-9a-f]{8}$/);
  });

  it('builds a learner who reached a unit', () => {
    expect(learnerAt(3)).toMatchObject({ currentUnit: 3, enrolledUnits: [1, 2, 3] });
  });
});
