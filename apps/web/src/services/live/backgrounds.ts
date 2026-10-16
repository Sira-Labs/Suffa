/**
 * Camera backgrounds in the live room (story 18.3): blur, or one of our own pictures with
 * Muslim motifs (tools/live-backgrounds). The picture is cut out in the browser with
 * MediaPipe's selfie segmenter; nothing leaves the device but the finished camera picture.
 * The model and its WASM come from our own origin (public/live/mediapipe and the build), so no
 * third-party CDN learns that someone is in a lesson.
 */

export const BACKGROUNDS = [
  'none',
  'blur',
  'stars',
  'arches',
  'mosque',
  'lattice',
] as const;
export type BackgroundId = (typeof BACKGROUNDS)[number];

/** Where MediaPipe finds its files (served by us, see vite.config.ts). */
export const MEDIAPIPE_ASSETS = {
  tasksVisionFileSet: '/live/mediapipe',
  modelAssetPath: '/live/mediapipe/selfie_segmenter.tflite',
} as const;

export const BLUR_RADIUS = 14;

export function isBackgroundId(value: unknown): value is BackgroundId {
  return typeof value === 'string' && (BACKGROUNDS as readonly string[]).includes(value);
}

/** The picture behind the person, or null for "none" and "blur". */
export function backgroundImage(id: BackgroundId): string | null {
  return id === 'none' || id === 'blur' ? null : `/live/backgrounds/${id}.jpg`;
}

/**
 * Whether this browser can replace the camera background. Mirrors the checks of
 * `@livekit/track-processors` without loading it: WebGL 2, OffscreenCanvas and VideoFrame,
 * and either insertable streams or canvas capture.
 */
export function canUseBackgrounds(scope: typeof globalThis = globalThis): boolean {
  try {
    const frames =
      typeof scope.OffscreenCanvas !== 'undefined' &&
      typeof scope.VideoFrame !== 'undefined' &&
      typeof scope.createImageBitmap !== 'undefined';
    const streams =
      ('MediaStreamTrackProcessor' in scope && 'MediaStreamTrackGenerator' in scope) ||
      (typeof scope.HTMLCanvasElement !== 'undefined' &&
        'captureStream' in scope.HTMLCanvasElement.prototype);
    if (!frames || !streams) return false;
    return Boolean(scope.document?.createElement('canvas').getContext('webgl2'));
  } catch {
    // A browser that throws while probing cannot run the processor either.
    return false;
  }
}

const STORAGE_KEY = 'suffa.liveBackground';

/** The background this person picked last time, so it comes back in the next lesson. */
export function rememberedBackground(): BackgroundId {
  try {
    const value = globalThis.localStorage?.getItem(STORAGE_KEY);
    return isBackgroundId(value) ? value : 'none';
  } catch {
    // Storage blocked (private mode): start without a background.
    return 'none';
  }
}

export function rememberBackground(id: BackgroundId): void {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, id);
  } catch {
    // Not remembered: the next lesson starts without a background.
  }
}
