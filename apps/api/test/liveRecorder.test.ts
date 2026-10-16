/**
 * What Suffa makes of an egress as LiveKit reports it (ADR-0029), and the worker step that
 * follows a live recording until it is stored.
 */
import {
  EgressInfo,
  EgressStatus,
  EncodedFileOutput,
  RoomCompositeEgressRequest,
  type EgressClient,
} from 'livekit-server-sdk';
import { describe, expect, it } from 'vitest';
import { runMediaJob, type MediaJobDeps } from '../src/media/jobs.js';
import { LiveKitRecorder, recordingState } from '../src/live/recorder.js';

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

describe('starting a recording with LiveKit Egress', () => {
  const live = {
    url: 'wss://live.example.org',
    apiUrl: 'https://live.example.org',
    apiKey: 'suffa',
    apiSecret: 'a-secret-from-env-that-is-long-enough',
  };
  const egress = (egressId: string, filepath: string) =>
    new EgressInfo({
      egressId,
      roomName: 'live-1',
      status: EgressStatus.EGRESS_ACTIVE,
      request: {
        case: 'roomComposite',
        value: new RoomCompositeEgressRequest({
          roomName: 'live-1',
          fileOutputs: [new EncodedFileOutput({ filepath })],
        }),
      },
    });

  /** A fake Egress: `running` is what LiveKit lists as active in the room. */
  function client(running: EgressInfo[], start: () => Promise<EgressInfo>) {
    const calls: string[] = [];
    const fake = {
      listEgress: async () => {
        calls.push('list');
        return [...running];
      },
      stopEgress: async (id: string) => {
        calls.push(`stop:${id}`);
        running.splice(
          running.findIndex((e) => e.egressId === id),
          1
        );
        return new EgressInfo();
      },
      startRoomCompositeEgress: async () => {
        calls.push('start');
        return start();
      },
    } as unknown as EgressClient;
    return { fake, calls };
  }

  it('starts the egress with our recording page', async () => {
    const { fake, calls } = client([], async () => egress('EG_1', 'k'));
    const recorder = new LiveKitRecorder(live, { templateUrl: 'https://x/r.html' }, fake);
    expect(await recorder.start('live-1', 'k')).toBe('EG_1');
    expect(calls).toEqual(['list', 'start']);
  });

  it('takes over the egress that started although the request timed out', async () => {
    const running: EgressInfo[] = [];
    const { fake } = client(running, async () => {
      running.push(egress('EG_2', 'recordings/c/m/original.mp4'));
      throw new Error('The operation was aborted due to timeout');
    });
    const recorder = new LiveKitRecorder(live, { templateUrl: 'https://x/r.html' }, fake);
    expect(await recorder.start('live-1', 'recordings/c/m/original.mp4')).toBe('EG_2');
  });

  it('fails when nothing started, and stops an egress left over in the room first', async () => {
    const running = [egress('EG_old', 'recordings/c/old/original.mp4')];
    const { fake, calls } = client(running, async () => {
      throw new Error('no egress worker available');
    });
    const recorder = new LiveKitRecorder(live, { templateUrl: 'https://x/r.html' }, fake);
    await expect(recorder.start('live-1', 'recordings/c/m/original.mp4')).rejects.toThrow(
      'no egress worker available'
    );
    expect(calls).toEqual(['list', 'stop:EG_old', 'start', 'list']);
  });
});
