import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import {
  asrAssessor,
  loadSet,
  PronunciationBaseline,
  pronunciationMarkdown,
  runPronunciationEval,
  toItems,
  transcriptAssessor,
  type LoadedCase,
} from '../src/evals/pronunciation.js';

const EVALS = fileURLToPath(new URL('../evals/pronunciation/', import.meta.url));

async function dataSet(cases: unknown[]) {
  const dir = await mkdtemp(join(tmpdir(), 'suffa-pron-'));
  const path = join(dir, 'set.json');
  await writeFile(path, JSON.stringify({ cases }));
  return path;
}

const teacher = { rating: 5, wrong: [] };

describe('pronunciation eval (story 15.5)', () => {
  it('the letter assessor meets the baseline on the fixture set', async () => {
    const baseline = PronunciationBaseline.parse(
      JSON.parse(await readFile(join(EVALS, 'baseline.json'), 'utf8'))
    );
    const report = await runPronunciationEval(
      await loadSet(join(EVALS, 'fixtures.json')),
      transcriptAssessor,
      baseline
    );
    expect(report.regressions).toEqual([]);
    expect(report.metrics.items).toBeGreaterThanOrEqual(25);
    // The fixtures include a recogniser mistake on a well-read word: it must show up.
    expect(report.metrics.falseRejections.count).toBeGreaterThan(0);
    expect(pronunciationMarkdown(report)).toContain('Meets the baseline.');
  });

  it('resolves the teacher’s marks to letters', () => {
    const [item] = toItems([
      {
        id: 'a',
        text: 'ثَلَاثَةٌ',
        transcript: 'سلاسه',
        teacher: { rating: 2, wrong: [{ letter: 'ث' }, { letter: 'ث', nth: 2 }] },
      },
    ]);
    expect(item!.teacher.wrong).toEqual([0, 5]);
  });

  it('rejects cases without transcript or audio, and audio outside the folder', async () => {
    await expect(
      loadSet(await dataSet([{ id: 'a', text: 'نَعَمْ', teacher }]))
    ).rejects.toThrow(/transcript or an audio file/);
    await expect(
      loadSet(
        await dataSet([{ id: 'a', text: 'نَعَمْ', audio: '../secret.m4a', teacher }])
      )
    ).rejects.toThrow(/inside the data set folder/);
    const [c] = await loadSet(
      await dataSet([
        { id: 'a', text: 'نَعَمْ', audio: 'a.m4a', durationSeconds: 2, teacher },
      ])
    );
    expect(c!.audioPath).toMatch(/a\.m4a$/);
  });

  it('sends recordings to the recogniser and measures latency and cost', async () => {
    const transcribe = vi.fn(async () => 'نعم');
    const read = vi.fn(async () => new Uint8Array(2048));
    // 1000 µ$ per minute; 30 s of audio → 500 µ$.
    const assessor = asrAssessor(transcribe, 1000, read);
    const c: LoadedCase = {
      id: 'a',
      text: 'نَعَمْ',
      audio: 'a.m4a',
      audioPath: '/data/a.m4a',
      durationSeconds: 30,
      teacher,
    };
    const run = await assessor.run(c);
    expect(transcribe).toHaveBeenCalledWith({
      bytes: expect.any(Uint8Array),
      mimeType: 'audio/mp4',
    });
    expect(read).toHaveBeenCalledWith('/data/a.m4a');
    expect(run).toMatchObject({
      score: 1,
      flagged: [],
      costMicro: 500,
      audioSeconds: 30,
    });
    expect(run.latencyMs).toBeGreaterThanOrEqual(0);

    const report = await runPronunciationEval([c, { ...c, id: 'b' }], assessor, {
      maxCostPerMinuteMicro: 500,
    });
    expect(report.metrics.costPerMinuteMicro).toBeCloseTo(1000);
    expect(report.regressions).toEqual(['cost 1000 µ$/min > 500 µ$/min']);
    expect(pronunciationMarkdown(report)).toContain('**Below the baseline:**');
  });

  it('refuses recordings it cannot price or send, and fixtures without transcript', async () => {
    const assessor = asrAssessor(
      async () => '',
      1000,
      async () => new Uint8Array(1)
    );
    const base: LoadedCase = { id: 'a', text: 'نَعَمْ', audio: 'a.m4a', teacher };
    await expect(assessor.run(base)).rejects.toThrow(/has no audio/);
    await expect(assessor.run({ ...base, audioPath: '/d/a.m4a' })).rejects.toThrow(
      /durationSeconds/
    );
    await expect(
      assessor.run({ ...base, audioPath: '/d/a.flac', durationSeconds: 2 })
    ).rejects.toThrow(/unsupported audio type \.flac/);
    await expect(transcriptAssessor.run(base)).rejects.toThrow(/no transcript/);
  });
});
