/**
 * Recording live lessons on the server (ADR-0029): LiveKit Egress opens our recording page
 * (apps/web/live-record.html) in its own Chrome, which shows the teacher's stage and plays the
 * voices of everyone who may speak, and writes the result as an MP4 into the class's
 * recordings in object storage. Only this file talks to Egress, so routes, the worker and
 * tests depend on the small `LiveRecorder` interface.
 *
 * Where the file goes is configured on the egress server itself (its `s3` settings): requests
 * carry only the object key, never a storage credential.
 */
import {
  EgressClient,
  EgressStatus,
  EncodedFileOutput,
  EncodedFileType,
  EncodingOptionsPreset,
  type EgressInfo,
} from 'livekit-server-sdk';
import type { LiveKitConfig } from '../config.js';

/** Where an egress stands: still writing, its file stored, or given up. */
export type RecordingState =
  | { state: 'running' }
  | { state: 'stored'; bytes: number }
  | { state: 'failed'; error: string };

export interface LiveRecorder {
  /** Starts recording `room` into the object `key`; returns the egress id. */
  start(room: string, key: string): Promise<string>;
  /** Stops an egress; no error when it has already ended. */
  stop(egressId: string): Promise<void>;
  state(egressId: string): Promise<RecordingState>;
}

/**
 * How long the API waits for Egress to take a request. Its first start launches Chrome on the
 * server and can take well over the SDK's default of 10 seconds.
 */
export const EGRESS_TIMEOUT_SECONDS = 60;

type Egress = Pick<
  EgressClient,
  'startRoomCompositeEgress' | 'stopEgress' | 'listEgress'
>;

/** The object key a room-composite egress writes to. */
function keyOf(info: EgressInfo): string | undefined {
  const request = info.request;
  if (request.case !== 'roomComposite') return undefined;
  const output = request.value.output;
  return output.case === 'file'
    ? output.value.filepath
    : request.value.fileOutputs[0]?.filepath;
}

/** One of our recordings: a room composite writing into the recordings of a class. */
function isRecording(info: EgressInfo): boolean {
  return keyOf(info)?.startsWith('recordings/') ?? false;
}

export interface RecorderConfig {
  /** The recording page Egress opens (https://…/live-record.html). */
  templateUrl: string;
}

/** LiveKit answers "not found" (or "failed precondition" once ended) for an egress that is over. */
function isOver(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const { status, code } = error as { status?: number; code?: string };
  return (
    status === 404 ||
    status === 412 ||
    code === 'not_found' ||
    code === 'failed_precondition'
  );
}

/** The state of an egress as LiveKit reports it. */
export function recordingState(info: EgressInfo | undefined): RecordingState {
  if (!info) return { state: 'failed', error: 'egress not found' };
  const file = info.fileResults[0];
  const bytes = file ? Number(file.size) : 0;
  switch (info.status) {
    case EgressStatus.EGRESS_STARTING:
    case EgressStatus.EGRESS_ACTIVE:
    case EgressStatus.EGRESS_ENDING:
      return { state: 'running' };
    case EgressStatus.EGRESS_COMPLETE:
    case EgressStatus.EGRESS_LIMIT_REACHED:
      // A lesson longer than the egress limit keeps what was recorded up to the limit.
      return bytes > 0
        ? { state: 'stored', bytes }
        : { state: 'failed', error: info.error || 'the recording is empty' };
    default:
      return { state: 'failed', error: info.error || EgressStatus[info.status] };
  }
}

export class LiveKitRecorder implements LiveRecorder {
  private readonly client: Egress;

  constructor(
    live: LiveKitConfig,
    private readonly config: RecorderConfig,
    client?: Egress
  ) {
    this.client =
      client ??
      new EgressClient(live.apiUrl, live.apiKey, live.apiSecret, {
        requestTimeout: EGRESS_TIMEOUT_SECONDS,
      });
  }

  /**
   * Starts recording a room into `key`. A room has one recording at most: one of our
   * recordings (a room composite writing under `recordings/`) still running there is left over
   * from a start that was never confirmed, and is stopped first. Other egresses are left alone.
   * If the start itself fails (often a timeout while Egress launches Chrome), Egress may have
   * taken it anyway: the egress writing to `key` is then adopted instead of left untracked.
   */
  async start(room: string, key: string): Promise<string> {
    // Clearing up is best effort: some LiveKit servers fail on listing a room's egresses, and
    // that must not keep the teacher from recording.
    const active = await this.client
      .listEgress({ roomName: room, active: true })
      .catch(() => []);
    for (const leftover of active.filter((info) => isRecording(info))) {
      await this.stop(leftover.egressId).catch(() => undefined);
    }
    try {
      const info = await this.client.startRoomCompositeEgress(
        room,
        new EncodedFileOutput({ fileType: EncodedFileType.MP4, filepath: key }),
        {
          customBaseUrl: this.config.templateUrl,
          encodingOptions: EncodingOptionsPreset.H264_720P_30,
        }
      );
      return info.egressId;
    } catch (error) {
      const running = await this.client
        .listEgress({ roomName: room, active: true })
        .catch(() => []);
      const ours = running.find((info) => keyOf(info) === key);
      if (ours) return ours.egressId;
      throw error;
    }
  }

  async stop(egressId: string): Promise<void> {
    try {
      await this.client.stopEgress(egressId);
    } catch (error) {
      if (!isOver(error)) throw error;
    }
  }

  async state(egressId: string): Promise<RecordingState> {
    const [info] = await this.client.listEgress({ egressId });
    return recordingState(info);
  }
}
