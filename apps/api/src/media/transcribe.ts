/**
 * Transcription (story 8.1) through any OpenAI-compatible speech-to-text endpoint: OpenAI,
 * Groq, or a self-hosted faster-whisper server (e.g. speaches) so audio never leaves our
 * servers. Long recordings are cut into 10-minute pieces (upload limits) and the cues are
 * shifted back into place.
 */
import { readdir, readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { basename, join } from 'node:path';
import type { Cue } from './interactive.js';

export interface Transcriber {
  transcribe(file: string): Promise<Cue[]>;
}

export interface TranscriberSettings {
  url: string;
  token: string | null;
  model: string;
}

/** Length of one piece sent to the service. */
export const CHUNK_SECONDS = 600;

type Fetch = typeof fetch;

/** One request: a file → cues from `verbose_json` segments. */
export async function transcribeFile(
  settings: TranscriberSettings,
  file: string,
  fetchImpl: Fetch = fetch
): Promise<Cue[]> {
  const form = new FormData();
  form.append(
    'file',
    new Blob([await readFile(file)], { type: 'audio/mp4' }),
    basename(file)
  );
  form.append('model', settings.model);
  form.append('language', 'ar');
  form.append('response_format', 'verbose_json');
  const response = await fetchImpl(settings.url, {
    method: 'POST',
    headers: settings.token ? { authorization: `Bearer ${settings.token}` } : undefined,
    body: form,
  });
  if (!response.ok) {
    throw new Error(
      `transcription failed: ${response.status} ${(await response.text()).slice(0, 300)}`
    );
  }
  const data = (await response.json()) as {
    text?: string;
    duration?: number;
    segments?: { start: number; end: number; text: string }[];
  };
  if (data.segments?.length) {
    return data.segments
      .map((s) => ({ start: s.start, end: s.end, text: s.text.trim() }))
      .filter((c) => c.text);
  }
  const text = data.text?.trim();
  return text ? [{ start: 0, end: data.duration ?? 0, text }] : [];
}

/** Cuts audio into CHUNK_SECONDS pieces without re-encoding; returns them in order. */
export async function splitAudio(file: string, dir: string): Promise<string[]> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(
      'ffmpeg',
      [
        '-hide_banner',
        '-nostdin',
        '-loglevel',
        'error',
        '-i',
        file,
        '-f',
        'segment',
        '-segment_time',
        String(CHUNK_SECONDS),
        '-c',
        'copy',
        join(dir, 'part%03d.m4a'),
      ],
      { stdio: ['ignore', 'ignore', 'pipe'] }
    );
    let err = '';
    child.stderr.on('data', (d) => (err += String(d)));
    child.on('error', reject);
    child.on('close', (code) =>
      code === 0 ? resolve() : reject(new Error(`ffmpeg split: ${err}`))
    );
  });
  return (await readdir(dir))
    .filter((f) => /^part\d{3}\.m4a$/.test(f))
    .sort()
    .map((f) => join(dir, f));
}

export class OpenAiCompatibleTranscriber implements Transcriber {
  constructor(
    private readonly settings: TranscriberSettings,
    private readonly workDir: (file: string) => string = (file) => `${file}.parts`,
    private readonly fetchImpl: Fetch = fetch
  ) {}

  async transcribe(file: string): Promise<Cue[]> {
    const dir = this.workDir(file);
    const { mkdir } = await import('node:fs/promises');
    await mkdir(dir, { recursive: true });
    const parts = await splitAudio(file, dir);
    const cues: Cue[] = [];
    for (const [i, part] of parts.entries()) {
      const offset = i * CHUNK_SECONDS;
      for (const cue of await transcribeFile(this.settings, part, this.fetchImpl)) {
        cues.push({ start: cue.start + offset, end: cue.end + offset, text: cue.text });
      }
    }
    return cues;
  }
}
