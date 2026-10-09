import { describe, expect, it, vi } from 'vitest';
import { AsrAssessor, BrowserAssessor, rateTranscript, SpeechApi } from './assessor';
import type { recognizeOnce } from './recognition';

const KITAB = 'كِتَابٌ';
const recording = {
  blob: new Blob([new Uint8Array(1024)], { type: 'audio/mp4' }),
  mimeType: 'audio/mp4',
};

describe('rateTranscript', () => {
  it('rates each spoken letter', () => {
    const outcome = rateTranscript(KITAB, 'كتاب');
    expect(outcome).toMatchObject({ ok: true, assessment: { score: 1 } });
  });

  it('gives no rating for a text the rules cannot read', () => {
    expect(rateTranscript('kitab', 'كتاب')).toEqual({
      ok: false,
      failure: { source: 'text' },
    });
  });
});

describe('SpeechApi', () => {
  it('sends the recording and the text as a form, without a JSON content type', async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json({ score: 1, letters: [], tips: [], transcript: '' })
    );
    const result = await new SpeechApi(fetchImpl).assess(KITAB, recording);
    expect(result.ok).toBe(true);
    const [path, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(path).toBe('/api/v1/speech/assess');
    expect(init.method).toBe('POST');
    expect(init.headers).toBeUndefined();
    const form = init.body as FormData;
    expect(form.get('text')).toBe(KITAB);
    expect((form.get('audio') as Blob).size).toBe(1024);
  });

  it('reads and changes the class setting', async () => {
    const fetchImpl = vi.fn(async (_path: string, init?: RequestInit) =>
      init?.method === 'PUT'
        ? new Response(null, { status: 204 })
        : Response.json({ serverSpeech: false })
    );
    const api = new SpeechApi(fetchImpl as unknown as typeof fetch);
    expect(await api.classSetting('c 1')).toEqual({
      ok: true,
      value: { serverSpeech: false },
    });
    expect(await api.setClassSetting('c 1', true)).toEqual({
      ok: true,
      value: undefined,
    });
    expect(fetchImpl.mock.calls[1]).toEqual([
      '/api/v1/classes/c%201/speech',
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({ serverSpeech: true }),
        headers: { 'content-type': 'application/json' },
      }),
    ]);
  });

  it('explains the server refusals in German', async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json({ error: 'speech_off_for_class' }, { status: 403 })
    );
    expect(await new SpeechApi(fetchImpl).settings()).toMatchObject({
      ok: false,
      message: 'Deine Klasse hat die Bewertung auf dem Server ausgeschaltet.',
    });
  });
});

describe('AsrAssessor', () => {
  it('passes the server rating on', async () => {
    const api = new SpeechApi();
    const assessment = { score: 0.5, letters: [], tips: [], transcript: 'كتب' };
    vi.spyOn(api, 'assess').mockResolvedValue({ ok: true, value: assessment });
    expect(await new AsrAssessor(api).assess(KITAB, recording)).toEqual({
      ok: true,
      assessment,
    });
  });

  it('reports a server failure with its message', async () => {
    const api = new SpeechApi();
    vi.spyOn(api, 'assess').mockResolvedValue({
      ok: false,
      status: 503,
      code: 'speech_unavailable',
      message: 'weg',
    });
    expect(await new AsrAssessor(api).assess(KITAB, recording)).toEqual({
      ok: false,
      failure: {
        source: 'server',
        status: 503,
        code: 'speech_unavailable',
        message: 'weg',
      },
    });
  });

  it('needs a recording', async () => {
    const api = new SpeechApi();
    const assess = vi.spyOn(api, 'assess');
    expect(await new AsrAssessor(api).assess(KITAB)).toMatchObject({
      ok: false,
      failure: { source: 'server', code: 'no_recording' },
    });
    expect(assess).not.toHaveBeenCalled();
  });
});

describe('BrowserAssessor', () => {
  it('rates what the browser heard', async () => {
    const recognize = vi.fn(async () => ({
      ok: true as const,
      result: { transcript: 'كتاب', confidence: 0.9, similarity: 1 },
    })) as unknown as typeof recognizeOnce;
    expect(await new BrowserAssessor(recognize).assess(KITAB)).toMatchObject({
      ok: true,
      assessment: { score: 1, transcript: 'كتاب' },
    });
  });

  it('passes the recognition failure on', async () => {
    const recognize = vi.fn(async () => ({
      ok: false as const,
      reason: 'no-speech' as const,
    }));
    expect(await new BrowserAssessor(recognize).assess(KITAB)).toEqual({
      ok: false,
      failure: { source: 'browser', reason: 'no-speech' },
    });
  });
});
