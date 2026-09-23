/**
 * Audio-Aufnahme via MediaRecorder für „Aufnahme & Vergleich“ (Shadowing).
 *
 * Graceful Fallback: ohne MediaRecorder/getUserMedia liefert `createRecorder`
 * null; die UI bietet dann nur Anhören statt Aufnehmen an.
 */
import { logger } from '@/services/logger';

const log = logger.child('audio:recorder');

export function isRecordingSupported(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    !!navigator.mediaDevices?.getUserMedia &&
    typeof MediaRecorder !== 'undefined'
  );
}

export interface ActiveRecorder {
  stop(): Promise<Blob>;
}

export async function createRecorder(): Promise<ActiveRecorder | null> {
  if (!isRecordingSupported()) {
    log.warn('Aufnahme nicht unterstützt');
    return null;
  }
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : 'unbekannt';
    log.warn('Mikrofonzugriff verweigert', { message });
    return null;
  }

  const chunks: BlobPart[] = [];
  const recorder = new MediaRecorder(stream);
  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) chunks.push(event.data);
  };
  recorder.start();

  return {
    stop(): Promise<Blob> {
      return new Promise((resolve) => {
        recorder.onstop = () => {
          stream.getTracks().forEach((t) => t.stop());
          resolve(new Blob(chunks, { type: recorder.mimeType || 'audio/webm' }));
        };
        recorder.stop();
      });
    },
  };
}
