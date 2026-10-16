/**
 * Recording a live lesson into the class's recordings (ADR-0029, Live 3).
 *
 * - The teacher starts and stops the recording in the room; everyone in the room sees that it
 *   runs (LiveKit tells every client while an egress records the room).
 * - The recording is a class recording with the source `live`: unpublished until the teacher
 *   shares it (with the consent confirmation of story 8.3), then transcoded, transcribed and
 *   summarised like an upload.
 * - The worker follows each recording until its file is stored, then hands it to the
 *   transcode. A recording still running after its session ended (ended by time, or the room
 *   was left open) is stopped there.
 */
import { randomUUID } from 'node:crypto';
import type { Logger } from 'pino';
import type { MediaRepository } from '../media/repository.js';
import { CLASS_QUOTA_BYTES, recordingKey } from '../media/service.js';
import type { ObjectStorage } from '../storage/objectStorage.js';
import type { LiveRecorder } from './recorder.js';
import type { LiveRecordingRepository } from './recordingRepository.js';
import type { LiveActor, LiveSession } from './repository.js';

/** Room kept free in the class quota before a recording starts (about 90 minutes of 720p). */
export const RECORDING_RESERVE_BYTES = 2 * 1024 ** 3;
/** A recording whose egress never reported back is given up after this long. */
export const ATTACH_TIMEOUT_MS = 10 * 60 * 1000;

export type StartRecordingResult =
  | { ok: true; mediaId: string }
  | { ok: false; reason: 'already_recording' | 'quota_exceeded' | 'recording_failed' };

/** What the worker found: follow again later, or nothing left to do. */
export type FollowResult = 'running' | 'done';

export interface LiveRecordingDeps {
  recordings: LiveRecordingRepository;
  media: Pick<MediaRepository, 'byId' | 'classBytes' | 'update'>;
  recorder: LiveRecorder;
  storage: Pick<ObjectStorage, 'head'>;
  /** Queues the worker step that follows a recording. */
  follow: (mediaId: string) => Promise<void>;
  /** Queues the transcode of a stored recording. */
  transcode: (mediaId: string) => Promise<void>;
  log: Pick<Logger, 'info' | 'warn'>;
  now?: () => Date;
}

/** The title a live recording starts with (the teacher can rename it). */
export function recordingTitle(session: LiveSession, at: Date): string {
  const day = at.toISOString().slice(0, 10);
  const suffix = ` · ${day}`;
  return session.title.slice(0, 120 - suffix.length) + suffix;
}

export class LiveRecordings {
  private readonly now: () => Date;

  constructor(private readonly deps: LiveRecordingDeps) {
    this.now = deps.now ?? (() => new Date());
  }

  /** Starts recording a live session's room. */
  async start(
    session: LiveSession,
    room: string,
    actor: LiveActor
  ): Promise<StartRecordingResult> {
    if (session.recording) return { ok: false, reason: 'already_recording' };
    const used = await this.deps.media.classBytes(session.classId);
    if (used + RECORDING_RESERVE_BYTES > CLASS_QUOTA_BYTES) {
      return { ok: false, reason: 'quota_exceeded' };
    }
    const mediaId = randomUUID();
    const key = recordingKey(session.classId, mediaId, 'original.mp4');
    const claimed = await this.deps.recordings.begin(
      session,
      { mediaId, createdBy: actor.id, title: recordingTitle(session, this.now()), key },
      actor
    );
    if (!claimed) return { ok: false, reason: 'already_recording' };
    let egressId: string;
    try {
      egressId = await this.deps.recorder.start(room, key);
    } catch (error) {
      // Nothing was recorded: the session is free to try again.
      await this.deps.recordings.discard(mediaId);
      this.deps.log.warn(
        { err: String(error), session: session.id },
        'live.recording_refused'
      );
      return { ok: false, reason: 'recording_failed' };
    }
    try {
      await this.deps.recordings.attach(mediaId, egressId);
      await this.deps.follow(mediaId);
    } catch (error) {
      // Without its egress id or a worker following it, nobody could stop or store this
      // recording: stop it now and free the session.
      await this.deps.recorder.stop(egressId).catch((stopError: unknown) => {
        this.deps.log.warn(
          { err: String(stopError), session: session.id },
          'live.recording_stop_failed'
        );
      });
      await this.deps.recordings.discard(mediaId);
      this.deps.log.warn(
        { err: String(error), session: session.id },
        'live.recording_setup_failed'
      );
      return { ok: false, reason: 'recording_failed' };
    }
    this.deps.log.info({ session: session.id, mediaId }, 'live.recording_started');
    return { ok: true, mediaId };
  }

  /** Stops the recording of a session; false when none is running. */
  async stop(session: LiveSession, actor: LiveActor): Promise<boolean> {
    const mediaId = await this.deps.recordings.current(session.id);
    if (!mediaId) return false;
    const item = await this.deps.media.byId(mediaId);
    if (item?.egressId) await this.deps.recorder.stop(item.egressId);
    // The worker, already following the recording, picks the file up once it is stored.
    await this.deps.recordings.release(mediaId, actor);
    return true;
  }

  /**
   * Worker step: checks on a recording. Once its file is stored it goes to the transcode;
   * a failed egress marks it failed. Returns `running` while the worker should look again.
   */
  async follow(mediaId: string): Promise<FollowResult> {
    const item = await this.deps.media.byId(mediaId);
    if (!item || item.status !== 'recording') return 'done';
    if (!item.egressId) {
      // The API went away between claiming and starting; give up after a while.
      if (this.now().getTime() - Date.parse(item.createdAt) < ATTACH_TIMEOUT_MS) {
        return 'running';
      }
      await this.fail(mediaId, 'the recording did not start');
      return 'done';
    }
    const state = await this.deps.recorder.state(item.egressId);
    if (state.state === 'running') {
      if (!(await this.deps.recordings.sessionLive(mediaId, this.now()))) {
        await this.deps.recorder.stop(item.egressId);
      }
      return 'running';
    }
    if (state.state === 'failed') {
      await this.fail(mediaId, state.error);
      return 'done';
    }
    // Trust the store, not the egress report: the file has to be where we read it from.
    const stored = await this.deps.storage.head('media', item.originalKey);
    if (!stored) {
      await this.fail(mediaId, 'the recording was not found in storage');
      return 'done';
    }
    await this.deps.recordings.release(mediaId);
    await this.deps.media.update(mediaId, {
      status: 'processing',
      originalSize: stored.size,
      progress: 0,
      error: null,
    });
    try {
      await this.deps.transcode(mediaId);
    } catch (error) {
      // Back to `recording`, so the retried check stores it again instead of leaving it
      // "processing" with no transcode queued.
      await this.deps.media.update(mediaId, { status: 'recording', progress: 0 });
      throw error;
    }
    this.deps.log.info({ mediaId, bytes: stored.size }, 'live.recording_stored');
    return 'done';
  }

  private async fail(mediaId: string, error: string): Promise<void> {
    await this.deps.recordings.release(mediaId);
    await this.deps.media.update(mediaId, {
      status: 'failed',
      error: error.slice(0, 500),
    });
    this.deps.log.warn({ mediaId, error }, 'live.recording_failed');
  }
}
