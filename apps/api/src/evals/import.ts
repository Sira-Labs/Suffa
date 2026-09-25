/**
 * `npm run eval:import -w @suffa/api -- <export.json>`: adds a teacher's reviewed grades (the
 * class export, story 11.2) to the grading golden set, each with a ±10 point range around the
 * teacher's score. Check the answers for personal data before committing them.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { GradingCase } from './harness.js';

const Exported = z.object({
  cases: z.array(
    z.object({
      kind: z.enum(['writing', 'speech']),
      task: z.string(),
      answer: z.string().min(1),
      expectedScore: z.number().min(0).max(100),
    })
  ),
});

/** New cases from an export, without the ones already in the set (same answer and task). */
export function importCases(existing: GradingCase[], exported: unknown): GradingCase[] {
  const seen = new Set(existing.map((c) => `${c.task}\n${c.answer}`));
  return Exported.parse(exported)
    .cases.filter((c) => !seen.has(`${c.task}\n${c.answer}`))
    .map((c) => ({
      id: `teacher-${createHash('sha256').update(`${c.task}\n${c.answer}`).digest('hex').slice(0, 8)}`,
      kind: c.kind,
      task: c.task,
      answer: c.answer,
      score: [Math.max(0, c.expectedScore - 10), Math.min(100, c.expectedScore + 10)] as [
        number,
        number,
      ],
    }));
}

async function main() {
  const file = process.argv[2];
  if (!file) throw new Error('usage: eval:import <export.json>');
  const target = fileURLToPath(new URL('../../evals/grading.json', import.meta.url));
  const set = JSON.parse(await readFile(target, 'utf8')) as { cases: GradingCase[] };
  const added = importCases(set.cases, JSON.parse(await readFile(file, 'utf8')));
  set.cases.push(...added);
  await writeFile(target, `${JSON.stringify(set, null, 2)}\n`);
  process.stdout.write(`${added.length} case(s) added to evals/grading.json\n`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
}
