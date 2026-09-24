import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  classifyMediaError,
  createRecorder,
  EmptyRecordingError,
  pickMimeType,
} from './recorder';

/** Minimal MediaRecorder stand-in: emits the given chunks on stop. */
function installMediaRecorder(chunks: Blob[], supported: string[]) {
  class FakeRecorder {
    static isTypeSupported = (t: string) => supported.includes(t);
    mimeType: string;
    ondataavailable: ((e: { data: Blob }) => void) | null = null;
    onstop: (() => void) | null = null;
    constructor(_stream: unknown, opts?: { mimeType?: string }) {
      this.mimeType = opts?.mimeType ?? '';
    }
    start() {}
    stop() {
      for (const data of chunks) this.ondataavailable?.({ data });
      this.onstop?.();
    }
  }
  vi.stubGlobal('MediaRecorder', FakeRecorder);
}

function installGetUserMedia(impl: () => Promise<unknown>) {
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia: vi.fn(impl) },
  });
}

const stream = { getTracks: () => [{ stop: vi.fn() }] };

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('pickMimeType', () => {
  it('uses audio/mp4 on Safari/iPhone and webm/opus on Chrome', () => {
    expect(pickMimeType((t) => t === 'audio/mp4')).toBe('audio/mp4');
    expect(pickMimeType((t) => t.startsWith('audio/webm'))).toBe(
      'audio/webm;codecs=opus'
    );
    expect(pickMimeType(() => false)).toBeUndefined();
  });
});

describe('classifyMediaError', () => {
  it.each([
    ['NotAllowedError', 'denied'],
    ['NotFoundError', 'no-device'],
    ['NotReadableError', 'busy'],
    ['SecurityError', 'insecure'],
    ['WeirdError', 'error'],
  ])('%s → %s', (name, reason) => {
    expect(classifyMediaError(new DOMException('x', name))).toBe(reason);
  });
});

describe('createRecorder', () => {
  it('reports a denied microphone instead of failing silently', async () => {
    installMediaRecorder([], ['audio/mp4']);
    installGetUserMedia(() => Promise.reject(new DOMException('no', 'NotAllowedError')));
    expect(await createRecorder()).toEqual({ ok: false, reason: 'denied' });
  });

  it('records with the supported format (iPhone: audio/mp4)', async () => {
    installMediaRecorder([new Blob(['abc'])], ['audio/mp4']);
    installGetUserMedia(() => Promise.resolve(stream));
    const started = await createRecorder();
    if (!started.ok) throw new Error('expected recorder');
    const recording = await started.recorder.stop();
    expect(recording.mimeType).toBe('audio/mp4');
    expect(recording.blob.size).toBe(3);
  });

  it('rejects an empty recording', async () => {
    installMediaRecorder([], ['audio/mp4']);
    installGetUserMedia(() => Promise.resolve(stream));
    const started = await createRecorder();
    if (!started.ok) throw new Error('expected recorder');
    await expect(started.recorder.stop()).rejects.toBeInstanceOf(EmptyRecordingError);
  });
});
