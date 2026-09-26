/** Worker step around the transcriber: progress writes and their failures. */
import { writeFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import {
  transcribeRecording,
  type InteractiveRepository,
} from '../src/media/interactive.js';

const quiet = { info: () => {}, warn: () => {} };

describe('transcribeRecording', () => {
  it('keeps writing progress after one write failed, and finishes', async () => {
    const writes: unknown[] = [];
    let failOnce = true;
    const interactive = {
      aiEnabled: async () => true,
      saveTranscript: async (_id: string, change: { progress?: number }) => {
        if (change.progress === 52 && failOnce) {
          failOnce = false;
          throw new Error('db hiccup');
        }
        writes.push(change);
      },
    } as unknown as InteractiveRepository;
    await expect(
      transcribeRecording(
        {
          media: {
            byId: async () => ({
              id: 'm1',
              classId: 'c1',
              renditions: { audio: 'a.m4a' },
            }),
          } as never,
          interactive,
          storage: {
            download: async (_bucket: string, _key: string, path: string) =>
              writeFile(path, 'x'),
          } as never,
          transcriber: {
            transcribe: async (_file, onProgress) => {
              await Promise.resolve(onProgress?.(0.5)).catch(() => {});
              await onProgress?.(1);
              return [{ start: 0, end: 1, text: 'مرحبا' }];
            },
          },
          log: quiet,
        },
        'm1'
      )
    ).resolves.toBeUndefined();
    expect(writes).toContainEqual({ progress: 99 });
    expect(writes.at(-1)).toMatchObject({ status: 'ready' });
  });
});
