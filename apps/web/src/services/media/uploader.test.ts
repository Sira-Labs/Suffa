import { describe, expect, it, vi } from 'vitest';
import {
  fileFingerprint,
  uploadRecording,
  UploadError,
  type UploaderDeps,
} from './uploader';

const MB = 1024 * 1024;

function memoryStorage() {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  };
}

function setup(stored: number[] = []) {
  const put = vi.fn(async (_url: string, _body: Blob) => undefined);
  const api = {
    start: vi.fn(async () => ({
      ok: true as const,
      value: {
        item: { id: 'm1' } as never,
        partSize: 4 * MB,
        partCount: 3,
      },
    })),
    partUrls: vi.fn(async (_c: string, _m: string, parts: number[]) => ({
      ok: true as const,
      value: { urls: Object.fromEntries(parts.map((n) => [n, `/media/p${n}`])) },
    })),
    uploadedParts: vi.fn(async () => ({ ok: true as const, value: { parts: stored } })),
    complete: vi.fn(async () => ({ ok: true as const, value: undefined })),
  };
  const deps: UploaderDeps = {
    api: api as unknown as UploaderDeps['api'],
    put,
    sleep: async () => undefined,
    storage: memoryStorage(),
  };
  return { deps, api, put };
}

const file = new File([new Uint8Array(10 * MB)], 'lesson.mp4', {
  type: 'video/mp4',
  lastModified: 1,
});

describe('uploadRecording', () => {
  it('uploads every part, reports progress and completes', async () => {
    const { deps, put, api } = setup();
    const progress: number[] = [];
    const result = await uploadRecording(deps, 'c1', file, 'Stunde 1', (p) =>
      progress.push(p.sentBytes)
    );
    expect(result).toEqual({ ok: true, mediaId: 'm1' });
    expect(put.mock.calls.map((c) => [c[0], (c[1] as Blob).size])).toEqual([
      ['/media/p1', 4 * MB],
      ['/media/p2', 4 * MB],
      ['/media/p3', 2 * MB],
    ]);
    expect(progress).toEqual([0, 4 * MB, 8 * MB, 10 * MB]);
    expect(api.complete).toHaveBeenCalledWith('c1', 'm1');
  });

  it('retries a dropped part and resumes a stopped upload without re-sending parts', async () => {
    const { deps, put, api } = setup();
    put.mockRejectedValueOnce(new TypeError('network down'));
    expect((await uploadRecording(deps, 'c1', file, 't', () => {})).ok).toBe(true);
    expect(put).toHaveBeenCalledTimes(4);

    // Stopped after part 1 (five failures on part 2); the next start picks it up.
    const second = setup([1]);
    second.deps.storage = deps.storage;
    second.put.mockRejectedValue(new UploadError('500'));
    const stopped = await uploadRecording(second.deps, 'c1', file, 't', () => {});
    expect(stopped).toMatchObject({ ok: false, mediaId: 'm1' });

    const third = setup([1, 2]);
    third.deps.storage = second.deps.storage;
    // The file is only registered on the first start; this run resumes it.
    third.deps.storage!.setItem(
      'suffa:upload-resume',
      JSON.stringify([
        {
          classId: 'c1',
          mediaId: 'm1',
          partSize: 4 * MB,
          partCount: 3,
          file: fileFingerprint(file),
        },
      ])
    );
    expect(await uploadRecording(third.deps, 'c1', file, 't', () => {})).toEqual({
      ok: true,
      mediaId: 'm1',
    });
    expect(third.api.start).not.toHaveBeenCalled();
    expect(third.put.mock.calls.map((c) => c[0])).toEqual(['/media/p3']);
    expect(api.start).toHaveBeenCalledTimes(1);
  });

  it('reports a refused start', async () => {
    const { deps, api } = setup();
    api.start.mockResolvedValueOnce({
      ok: false,
      message: 'zu groß',
    } as never);
    expect(await uploadRecording(deps, 'c1', file, 't', () => {})).toEqual({
      ok: false,
      message: 'zu groß',
    });
  });

  it('sends up to three parts at once and moves the bar while a part is on its way', async () => {
    const { deps } = setup();
    let running = 0;
    let most = 0;
    deps.put = vi.fn(async (_url, body, _signal, onSent) => {
      running++;
      most = Math.max(most, running);
      onSent?.(body.size / 2);
      await new Promise((resolve) => setTimeout(resolve, 5));
      onSent?.(body.size);
      running--;
    });
    const progress: number[] = [];
    const result = await uploadRecording(deps, 'c1', file, 'Stunde', (p) =>
      progress.push(p.sentBytes)
    );
    expect(result.ok).toBe(true);
    expect(most).toBe(3);
    // Half a part is reported before any part is done, and the bar ends at the full size.
    expect(progress).toContain(2 * MB);
    expect(progress.at(-1)).toBe(10 * MB);
    expect(Math.max(...progress)).toBe(10 * MB);
  });
});
