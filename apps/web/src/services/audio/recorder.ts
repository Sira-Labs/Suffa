/**
 * Audio recording via MediaRecorder for "record & compare" (shadowing).
 *
 * - Picks a format the browser actually supports: iPhone/Safari records `audio/mp4`,
 *   Chrome/Firefox `audio/webm;codecs=opus`. Without a matching type some devices
 *   produce empty or unplayable recordings.
 * - On problems returns a typed reason (denied, no microphone, insecure
 *   connection …) so the UI can show specific help instead of failing silently.
 */
import { logger } from '@/services/logger';

const log = logger.child('audio:recorder');

/** Preferred formats in order; the first supported one wins. */
export const PREFERRED_MIME_TYPES = [
  'audio/webm;codecs=opus',
  'audio/mp4',
  'audio/webm',
  'audio/aac',
  'audio/ogg;codecs=opus',
] as const;

/** Collect chunks at short intervals (more robust on iOS than only on stop). */
const TIMESLICE_MS = 250;

export type RecorderFailure =
  | 'unsupported'
  | 'denied'
  | 'no-device'
  | 'insecure'
  | 'busy'
  | 'error';

export interface Recording {
  blob: Blob;
  mimeType: string;
}

export interface ActiveRecorder {
  /** Stops the recording; rejects with EmptyRecordingError if nothing was recorded. */
  stop(): Promise<Recording>;
}

export type RecorderStart =
  | { ok: true; recorder: ActiveRecorder }
  | { ok: false; reason: RecorderFailure };

export function isRecordingSupported(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    !!navigator.mediaDevices?.getUserMedia &&
    typeof MediaRecorder !== 'undefined'
  );
}

/** First supported format, or undefined (the browser then decides). */
export function pickMimeType(
  isSupported: (type: string) => boolean = (t) =>
    typeof MediaRecorder !== 'undefined' &&
    typeof MediaRecorder.isTypeSupported === 'function' &&
    MediaRecorder.isTypeSupported(t)
): string | undefined {
  return PREFERRED_MIME_TYPES.find((type) => isSupported(type));
}

/** Maps getUserMedia errors (DOMException names) to a reason for the UI. */
export function classifyMediaError(cause: unknown): RecorderFailure {
  const name = cause instanceof Error || cause instanceof DOMException ? cause.name : '';
  switch (name) {
    case 'NotAllowedError':
    case 'PermissionDeniedError':
      return 'denied';
    case 'NotFoundError':
    case 'DevicesNotFoundError':
    case 'OverconstrainedError':
      return 'no-device';
    case 'SecurityError':
      return 'insecure';
    case 'NotReadableError':
    case 'TrackStartError':
    case 'AbortError':
      return 'busy';
    default:
      return 'error';
  }
}

export class EmptyRecordingError extends Error {
  constructor() {
    super('The recording is empty.');
    this.name = 'EmptyRecordingError';
  }
}

export async function createRecorder(): Promise<RecorderStart> {
  if (typeof window !== 'undefined' && window.isSecureContext === false) {
    return { ok: false, reason: 'insecure' };
  }
  if (!isRecordingSupported()) {
    log.warn('Recording not supported');
    return { ok: false, reason: 'unsupported' };
  }

  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (cause) {
    const reason = classifyMediaError(cause);
    log.warn('Microphone access failed', {
      reason,
      name: cause instanceof Error ? cause.name : 'unknown',
    });
    return { ok: false, reason };
  }

  const mimeType = pickMimeType();
  let recorder: MediaRecorder;
  try {
    recorder = mimeType
      ? new MediaRecorder(stream, { mimeType })
      : new MediaRecorder(stream);
  } catch (cause) {
    stream.getTracks().forEach((t) => t.stop());
    log.warn('MediaRecorder could not be created', {
      mimeType,
      cause: String(cause),
    });
    return { ok: false, reason: 'unsupported' };
  }

  const chunks: Blob[] = [];
  recorder.ondataavailable = (event) => {
    if (event.data && event.data.size > 0) chunks.push(event.data);
  };
  recorder.start(TIMESLICE_MS);

  return {
    ok: true,
    recorder: {
      stop(): Promise<Recording> {
        return new Promise((resolve, reject) => {
          recorder.onstop = () => {
            stream.getTracks().forEach((t) => t.stop());
            const type = recorder.mimeType || mimeType || 'audio/webm';
            const blob = new Blob(chunks, { type });
            if (blob.size === 0) {
              log.warn('Empty recording', { type });
              reject(new EmptyRecordingError());
              return;
            }
            resolve({ blob, mimeType: type });
          };
          recorder.stop();
        });
      },
    },
  };
}
