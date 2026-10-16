/**
 * What Suffa makes of an egress as LiveKit reports it (ADR-0029), and the worker step that
 * follows a live recording until it is stored.
 */
import { EgressInfo, EgressStatus } from 'livekit-server-sdk';
import { describe, expect, it } from 'vitest';
import { runMediaJob, type MediaJobDeps } from '../src/media/jobs.js';
import { recordingState } from '../src/live/recorder.js';

const info = (status: EgressStatus, size = 0n, error = '') =>
  new EgressInfo({ egressId: 'EG_1', status, error, fileResults: [{ size }] });

describe('the state of an egress', () => {
  it('is running while it starts, records and finishes the file', () => {
    for (const status of [
      EgressStatus.EGRESS_STARTING,
      EgressStatus.EGRESS_ACTIVE,
      EgressStatus.EGRESS_ENDING,
    ]) {
      expect(recordingState(info(status))).toEqual({ state: 'running' });
    }
  });

  it('is stored once complete, also when the egress hit its time limit', () => {
    expect(recordingState(info(EgressStatus.EGRESS_COMPLETE, 4096n))).toEqual({
      state: 'stored',
      bytes: 4096,
    });
    expect(recordingState(info(EgressStatus.EGRESS_LIMIT_REACHED, 10n))).toEqual({
      state: 'stored',
      bytes: 10,
    });
  });

  it('failed when aborted, failed, empty or unknown', () => {
    expect(
      recordingState(info(EgressStatus.EGRESS_ABORTED, 0n, 'Start signal not received'))
    ).toEqual({ state: 'failed', error: 'Start signal not received' });
    expect(recordingState(info(EgressStatus.EGRESS_FAILED))).toEqual({
      state: 'failed',
      error: 'EGRESS_FAILED',
    });
    expect(recordingState(info(EgressStatus.EGRESS_COMPLETE, 0n))).toEqual({
      state: 'failed',
      error: 'the recording is empty',
    });
    expect(recordingState(undefined)).toEqual({
      state: 'failed',
      error: 'egress not found',
    });
  });
});

describe('the media job following a live recording', () => {
  const mediaId = '33333333-3333-4333-8333-333333333333';
  const deps = (result: 'running' | 'done', later: string[]) =>
    ({
      followRecording: async () => result,
      followLater: async (id: string) => {
        later.push(id);
      },
    }) as unknown as MediaJobDeps;

  it('looks again later while the recording runs, and stops once it is done', async () => {
    const later: string[] = [];
    await runMediaJob(deps('running', later), { task: 'live-recording', mediaId });
    expect(later).toEqual([mediaId]);
    await runMediaJob(deps('done', later), { task: 'live-recording', mediaId });
    expect(later).toEqual([mediaId]);
  });

  it('fails where live recording is not set up', async () => {
    await expect(
      runMediaJob({} as MediaJobDeps, { task: 'live-recording', mediaId })
    ).rejects.toThrow(/not configured/);
  });
});
