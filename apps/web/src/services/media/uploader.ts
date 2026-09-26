/**
 * Resumable upload of a recording (story 7.3): the file goes in parts straight to object
 * storage via presigned URLs. A part that fails is retried with growing pauses (and after the
 * connection is back); a page reload resumes when the same file is picked again, because the
 * server knows which parts are already stored.
 */
import type { MediaApi, UploadPlan } from './mediaApi';

/** Part URLs fetched per request. */
const URL_BATCH = 20;
/** Tries per part before the upload stops (the next start resumes it). */
const MAX_TRIES = 5;
/** Parts sent at the same time: hides the latency per request on slow links. */
export const PARALLEL_PARTS = 3;
const RESUME_KEY = 'suffa:upload-resume';

export interface UploadProgress {
  mediaId: string;
  sentBytes: number;
  totalBytes: number;
}

export interface UploaderDeps {
  api: Pick<MediaApi, 'start' | 'partUrls' | 'uploadedParts' | 'complete'>;
  /** PUT one part; resolves when stored. `onSent` reports the bytes of this part sent so far. */
  put(
    url: string,
    body: Blob,
    signal?: AbortSignal,
    onSent?: (bytes: number) => void
  ): Promise<void>;
  sleep(ms: number): Promise<void>;
  storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
}

export type UploadResult =
  | { ok: true; mediaId: string }
  | { ok: false; message: string; mediaId?: string };

interface Resumable {
  classId: string;
  mediaId: string;
  partSize: number;
  partCount: number;
  file: string;
}

/** Identifies a picked file across reloads (name, size, last change). */
export function fileFingerprint(
  file: Pick<File, 'name' | 'size' | 'lastModified'>
): string {
  return `${file.name}|${file.size}|${file.lastModified}`;
}

function readResume(deps: UploaderDeps): Resumable[] {
  try {
    return JSON.parse(deps.storage?.getItem(RESUME_KEY) ?? '[]') as Resumable[];
  } catch (error) {
    if (error instanceof SyntaxError || error instanceof DOMException) return [];
    throw error;
  }
}

function writeResume(deps: UploaderDeps, entries: Resumable[]): void {
  try {
    deps.storage?.setItem(RESUME_KEY, JSON.stringify(entries.slice(-10)));
  } catch (error) {
    // Without storage an interrupted upload simply starts over.
    if (!(error instanceof DOMException)) throw error;
  }
}

export async function uploadRecording(
  deps: UploaderDeps,
  classId: string,
  file: File,
  title: string,
  onProgress: (p: UploadProgress) => void,
  signal?: AbortSignal
): Promise<UploadResult> {
  const fingerprint = fileFingerprint(file);
  const saved = readResume(deps).find(
    (r) => r.classId === classId && r.file === fingerprint
  );
  let plan: Pick<UploadPlan, 'partSize' | 'partCount'> & { mediaId: string };
  let done = new Set<number>();

  const existing = saved ? await deps.api.uploadedParts(classId, saved.mediaId) : null;
  if (saved && existing?.ok) {
    plan = saved;
    done = new Set(existing.value.parts);
  } else {
    const started = await deps.api.start(classId, {
      title,
      fileName: file.name,
      size: file.size,
      contentType: file.type,
    });
    if (!started.ok) return { ok: false, message: started.message };
    plan = { mediaId: started.value.item.id, ...started.value };
    writeResume(deps, [
      ...readResume(deps).filter((r) => r.file !== fingerprint),
      { classId, file: fingerprint, ...plan },
    ]);
  }

  const partBytes = (n: number) =>
    Math.min(plan.partSize, file.size - (n - 1) * plan.partSize);
  let sent = [...done].reduce((sum, n) => sum + partBytes(n), 0);
  onProgress({ mediaId: plan.mediaId, sentBytes: sent, totalBytes: file.size });

  const missing = Array.from({ length: plan.partCount }, (_, i) => i + 1).filter(
    (n) => !done.has(n)
  );
  // Bytes of the parts in flight, so the bar moves while a 32 MB part is on its way.
  const inFlight = new Map<number, number>();
  const report = () => {
    let moving = 0;
    for (const bytes of inFlight.values()) moving += bytes;
    onProgress({
      mediaId: plan.mediaId,
      sentBytes: sent + moving,
      totalBytes: file.size,
    });
  };

  /** Sends one part with retries; returns a failure result, or null when stored. */
  const sendPart = async (n: number, url: string): Promise<UploadResult | null> => {
    const body = file.slice(
      (n - 1) * plan.partSize,
      (n - 1) * plan.partSize + partBytes(n)
    );
    let tries = 0;
    for (;;) {
      if (signal?.aborted) {
        return { ok: false, message: 'Upload angehalten.', mediaId: plan.mediaId };
      }
      try {
        await deps.put(url, body, signal, (bytes) => {
          inFlight.set(n, bytes);
          report();
        });
        inFlight.delete(n);
        sent += partBytes(n);
        report();
        return null;
      } catch (error) {
        if (!(error instanceof TypeError) && !(error instanceof UploadError)) throw error;
        inFlight.delete(n);
        report();
        tries++;
        if (tries >= MAX_TRIES) {
          return {
            ok: false,
            message:
              'Die Verbindung ist abgebrochen. Wähle die Datei erneut, um fortzusetzen.',
            mediaId: plan.mediaId,
          };
        }
        await deps.sleep(Math.min(30_000, 1000 * 2 ** tries));
      }
    }
  };

  for (let i = 0; i < missing.length; i += URL_BATCH) {
    const batch = missing.slice(i, i + URL_BATCH);
    const urls = await deps.api.partUrls(classId, plan.mediaId, batch);
    if (!urls.ok) return { ok: false, message: urls.message, mediaId: plan.mediaId };
    let next = 0;
    let failure: UploadResult | null = null;
    const lane = async () => {
      while (failure === null && next < batch.length) {
        const n = batch[next++]!;
        failure = (await sendPart(n, urls.value.urls[n]!)) ?? failure;
      }
    };
    await Promise.all(
      Array.from({ length: Math.min(PARALLEL_PARTS, batch.length) }, lane)
    );
    if (failure) return failure;
  }

  const completed = await deps.api.complete(classId, plan.mediaId);
  if (!completed.ok)
    return { ok: false, message: completed.message, mediaId: plan.mediaId };
  writeResume(
    deps,
    readResume(deps).filter((r) => r.mediaId !== plan.mediaId)
  );
  return { ok: true, mediaId: plan.mediaId };
}

/** A part the store refused (other than a network error). */
export class UploadError extends Error {}

/** Browser PUT of one part (same-origin /media URL). */
export function putPart(
  url: string,
  body: Blob,
  signal?: AbortSignal,
  onSent?: (bytes: number) => void
): Promise<void> {
  // XMLHttpRequest, not fetch: only it reports upload progress.
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const abort = () => xhr.abort();
    const done = () => signal?.removeEventListener('abort', abort);
    xhr.open('PUT', url);
    xhr.upload.onprogress = (event) => onSent?.(event.loaded);
    xhr.onload = () => {
      done();
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new UploadError(`part upload failed (${xhr.status})`));
    };
    // Same error type as a failed fetch, so the uploader retries it.
    xhr.onerror = () => {
      done();
      reject(new TypeError('network error'));
    };
    xhr.onabort = () => {
      done();
      reject(new DOMException('Upload aborted', 'AbortError'));
    };
    signal?.addEventListener('abort', abort, { once: true });
    xhr.send(body);
  });
}
