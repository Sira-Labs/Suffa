/**
 * Audio-Aufnahme via MediaRecorder für „Aufnahme & Vergleich“ (Shadowing).
 *
 * - Wählt ein Format, das der Browser wirklich kann: iPhone/Safari nimmt `audio/mp4` auf,
 *   Chrome/Firefox `audio/webm;codecs=opus`. Ohne passende Angabe liefern manche Geräte
 *   leere oder nicht abspielbare Aufnahmen.
 * - Liefert bei Problemen einen typisierten Grund (verweigert, kein Mikrofon, unsichere
 *   Verbindung …), damit die UI eine konkrete Hilfe anzeigen kann statt still zu scheitern.
 */
import { logger } from '@/services/logger';

const log = logger.child('audio:recorder');

/** Bevorzugte Formate in Reihenfolge; das erste unterstützte gewinnt. */
export const PREFERRED_MIME_TYPES = [
  'audio/webm;codecs=opus',
  'audio/mp4',
  'audio/webm',
  'audio/aac',
  'audio/ogg;codecs=opus',
] as const;

/** Chunks in kurzen Abständen einsammeln (robuster auf iOS als nur beim Stoppen). */
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
  /** Stoppt die Aufnahme; lehnt mit 'empty' ab, wenn nichts aufgenommen wurde. */
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

/** Erstes unterstütztes Format, oder undefined (dann entscheidet der Browser). */
export function pickMimeType(
  isSupported: (type: string) => boolean = (t) =>
    typeof MediaRecorder !== 'undefined' &&
    typeof MediaRecorder.isTypeSupported === 'function' &&
    MediaRecorder.isTypeSupported(t)
): string | undefined {
  return PREFERRED_MIME_TYPES.find((type) => isSupported(type));
}

/** Übersetzt getUserMedia-Fehler (DOMException-Namen) in einen Grund für die UI. */
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
    super('Die Aufnahme ist leer.');
    this.name = 'EmptyRecordingError';
  }
}

export async function createRecorder(): Promise<RecorderStart> {
  if (typeof window !== 'undefined' && window.isSecureContext === false) {
    return { ok: false, reason: 'insecure' };
  }
  if (!isRecordingSupported()) {
    log.warn('Aufnahme nicht unterstützt');
    return { ok: false, reason: 'unsupported' };
  }

  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (cause) {
    const reason = classifyMediaError(cause);
    log.warn('Mikrofonzugriff fehlgeschlagen', {
      reason,
      name: cause instanceof Error ? cause.name : 'unbekannt',
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
    log.warn('MediaRecorder konnte nicht erstellt werden', {
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
              log.warn('Leere Aufnahme', { type });
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
