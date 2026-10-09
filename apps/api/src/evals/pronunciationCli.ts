/**
 * `npm run eval:pronunciation -w @suffa/api [-- <data set>]` (story 15.5).
 *
 * Without arguments it rates the fixture set (stored transcripts, no cost). With a data set
 * that has recordings (the consented pilot data, kept outside the repository) it sends them
 * to the speech recogniser configured like the server (SUFFA_TRANSCRIBE_URL, …_TOKEN or
 * SUFFA_MISTRAL_API_KEY, …_MODEL) and needs SUFFA_EVAL_STT_USD_PER_MINUTE for the cost.
 * Exits 1 when the run falls below evals/pronunciation/baseline.json.
 */
import { appendFile, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { transcribeClip } from '../media/transcribe.js';
import {
  asrAssessor,
  loadSet,
  PronunciationBaseline,
  pronunciationMarkdown,
  runPronunciationEval,
  transcriptAssessor,
} from './pronunciation.js';

const here = (path: string) => fileURLToPath(new URL(path, import.meta.url));
const FIXTURES = here('../../evals/pronunciation/fixtures.json');
const BASELINE = here('../../evals/pronunciation/baseline.json');

async function main(): Promise<number> {
  const setPath = process.argv[2] ?? FIXTURES;
  const cases = await loadSet(setPath);
  const baseline = PronunciationBaseline.parse(
    JSON.parse(await readFile(BASELINE, 'utf8'))
  );
  const withAudio = cases.every((c) => c.audioPath !== undefined);
  let assessor = transcriptAssessor;
  if (withAudio) {
    const url = process.env.SUFFA_TRANSCRIBE_URL;
    const token =
      process.env.SUFFA_TRANSCRIBE_TOKEN || process.env.SUFFA_MISTRAL_API_KEY || null;
    const price = Number(process.env.SUFFA_EVAL_STT_USD_PER_MINUTE);
    if (!url || !Number.isFinite(price)) {
      process.stderr.write(
        'Recordings need SUFFA_TRANSCRIBE_URL and SUFFA_EVAL_STT_USD_PER_MINUTE.\n'
      );
      return 2;
    }
    const settings = {
      url,
      token,
      model: process.env.SUFFA_TRANSCRIBE_MODEL || 'voxtral-mini-latest',
      language: 'ar',
    };
    assessor = asrAssessor((clip) => transcribeClip(settings, clip), price * 1e6);
  }
  const report = await runPronunciationEval(cases, assessor, baseline);
  const markdown = pronunciationMarkdown(report);
  process.stdout.write(`${markdown}\n`);
  if (process.env.GITHUB_STEP_SUMMARY) {
    await appendFile(process.env.GITHUB_STEP_SUMMARY, `${markdown}\n`);
  }
  return report.regressions.length ? 1 : 0;
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
