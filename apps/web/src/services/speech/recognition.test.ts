import { afterEach, describe, expect, it, vi } from 'vitest';
import { classifyRecognitionError, recognizeOnce } from './recognition';

type Behaviour =
  | { kind: 'result'; transcript: string }
  | { kind: 'error'; code: string }
  | { kind: 'silent' }
  | { kind: 'throws' };

function installRecognition(behaviour: Behaviour) {
  class FakeRecognition {
    lang = '';
    interimResults = false;
    maxAlternatives = 1;
    continuous = false;
    onresult: ((e: unknown) => void) | null = null;
    onerror: ((e: { error: string }) => void) | null = null;
    onend: (() => void) | null = null;
    stop = vi.fn();
    start() {
      if (behaviour.kind === 'throws')
        throw new DOMException('busy', 'InvalidStateError');
      queueMicrotask(() => {
        if (behaviour.kind === 'result') {
          this.onresult?.({
            results: [[{ transcript: behaviour.transcript, confidence: 0.9 }]],
          });
        } else if (behaviour.kind === 'error') {
          this.onerror?.({ error: behaviour.code });
        }
      });
    }
  }
  vi.stubGlobal('webkitSpeechRecognition', FakeRecognition);
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('recognizeOnce', () => {
  it('returns the transcript with a tashkīl-tolerant similarity', async () => {
    installRecognition({ kind: 'result', transcript: 'السلام عليكم' });
    const outcome = await recognizeOnce({ target: 'السَّلَامُ عَلَيْكُمْ' });
    expect(outcome).toMatchObject({ ok: true, result: { similarity: 1 } });
  });

  it('explains iOS refusals instead of doing nothing', async () => {
    installRecognition({ kind: 'error', code: 'service-not-allowed' });
    expect(await recognizeOnce({ target: 'x' })).toEqual({
      ok: false,
      reason: 'service-not-allowed',
    });
  });

  it('never hangs: times out when the engine stays silent (seen on iOS)', async () => {
    vi.useFakeTimers();
    installRecognition({ kind: 'silent' });
    const pending = recognizeOnce({ target: 'x', timeoutMs: 5000 });
    await vi.advanceTimersByTimeAsync(5000);
    expect(await pending).toEqual({ ok: false, reason: 'timeout' });
  });

  it('handles a start() that throws', async () => {
    installRecognition({ kind: 'throws' });
    expect(await recognizeOnce({ target: 'x' })).toEqual({ ok: false, reason: 'error' });
  });

  it('reports unsupported browsers', async () => {
    expect(await recognizeOnce({ target: 'x' })).toEqual({
      ok: false,
      reason: 'unsupported',
    });
  });
});

describe('classifyRecognitionError', () => {
  it('maps known codes and treats unknown ones as generic errors', () => {
    expect(classifyRecognitionError('language-not-supported')).toBe(
      'language-not-supported'
    );
    expect(classifyRecognitionError('aborted')).toBe('no-speech');
    expect(classifyRecognitionError('bad-grammar')).toBe('error');
  });
});
