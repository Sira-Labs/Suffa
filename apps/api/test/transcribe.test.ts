import { execFileSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  CHUNK_SECONDS,
  OpenAiCompatibleTranscriber,
  transcribeFile,
} from '../src/media/transcribe.js';

const hasFfmpeg = (() => {
  try {
    execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
})();
const settings = {
  url: 'https://stt.example/v1/audio/transcriptions',
  token: 'tok',
  model: 'whisper-1',
};

describe('transcription client', () => {
  it('sends Arabic audio and reads verbose_json segments or plain text', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'suffa-stt-'));
    const file = join(dir, 'a.m4a');
    await writeFile(file, 'audio');
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          segments: [
            { start: 0, end: 1.5, text: ' مرحبا ' },
            { start: 2, end: 3, text: ' ' },
          ],
        })
      )
      .mockResolvedValueOnce(Response.json({ text: 'أهلا', duration: 4 }))
      .mockResolvedValueOnce(new Response('quota', { status: 429 }));
    const fetchFn = fetchImpl as unknown as typeof fetch;
    expect(await transcribeFile(settings, file, fetchFn)).toEqual([
      { start: 0, end: 1.5, text: 'مرحبا' },
    ]);
    const [, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer tok');
    const form = init.body as FormData;
    expect(form.get('language')).toBe('ar');
    expect(form.get('response_format')).toBe('verbose_json');
    expect(await transcribeFile(settings, file, fetchFn)).toEqual([
      { start: 0, end: 4, text: 'أهلا' },
    ]);
    await expect(transcribeFile(settings, file, fetchFn)).rejects.toThrow(/429/);
    await rm(dir, { recursive: true });
  });

  it.skipIf(!hasFfmpeg)(
    'cuts long audio into pieces and shifts their cues',
    async () => {
      const dir = await mkdtemp(join(tmpdir(), 'suffa-stt-'));
      const file = join(dir, 'long.m4a');
      execFileSync('ffmpeg', [
        '-hide_banner',
        '-loglevel',
        'error',
        '-f',
        'lavfi',
        '-i',
        `sine=frequency=300:duration=${CHUNK_SECONDS + 30}`,
        '-c:a',
        'aac',
        '-b:a',
        '16k',
        file,
      ]);
      const fetchImpl = vi.fn(async () =>
        Response.json({ segments: [{ start: 1, end: 2, text: 'x' }] })
      ) as unknown as typeof fetch;
      const cues = await new OpenAiCompatibleTranscriber(
        settings,
        () => join(dir, 'parts'),
        fetchImpl
      ).transcribe(file);
      expect(cues.map((c) => c.start)).toEqual([1, CHUNK_SECONDS + 1]);
      await rm(dir, { recursive: true });
    },
    60_000
  );
});
