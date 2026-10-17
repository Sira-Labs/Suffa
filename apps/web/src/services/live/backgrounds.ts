/**
 * Camera backgrounds in the live room (story 18.3): blur, or one of our own pictures with
 * Muslim motifs (tools/live-backgrounds). The picture is cut out in the browser with
 * MediaPipe's selfie segmenter; nothing leaves the device but the finished camera picture.
 * The model and its WASM come from our own origin (public/live/mediapipe and the build), so no
 * third-party CDN learns that someone is in a lesson.
 *
 * People can add pictures of their own; those stay on the device (ownBackgrounds.ts) and are
 * picked as `own:<id>`.
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

/** One of the person's own pictures, by its id on this device. */
export type OwnBackgroundChoice = `own:${string}`;
/** What the person picked: one of ours or one of their own pictures. */
export type BackgroundChoice = BackgroundId | OwnBackgroundChoice;

const OWN_CHOICE = /^own:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function isOwnChoice(value: unknown): value is OwnBackgroundChoice {
  return typeof value === 'string' && OWN_CHOICE.test(value);
}

export const ownChoice = (id: string): OwnBackgroundChoice => `own:${id}`;

export const ownIdOf = (choice: OwnBackgroundChoice): string => choice.slice(4);

/** The picture behind the person, or null for "none" and "blur". */
export function backgroundImage(id: BackgroundId): string | null {
  return id === 'none' || id === 'blur' ? null : `/live/backgrounds/${id}.jpg`;
}

/** What the camera puts behind the person: nothing, blur, or a picture the browser can load. */
export type CameraBackground =
  | { kind: 'none' }
  | { kind: 'blur' }
  | { kind: 'image'; url: string };

export function builtInBackground(id: BackgroundId): CameraBackground {
  if (id === 'none' || id === 'blur') return { kind: id };
  return { kind: 'image', url: backgroundImage(id)! };
}

/**
 * The camera background of a choice; `ownUrl` finds the person's own pictures. Null when that
 * picture is no longer on this device.
 */
export function cameraBackground(
  choice: BackgroundChoice,
  ownUrl: (id: string) => string | undefined
): CameraBackground | null {
  if (!isOwnChoice(choice)) return builtInBackground(choice);
  const url = ownUrl(ownIdOf(choice));
  return url ? { kind: 'image', url } : null;
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
export function rememberedBackground(): BackgroundChoice {
  try {
    const value = globalThis.localStorage?.getItem(STORAGE_KEY);
    return isBackgroundId(value) || isOwnChoice(value) ? value : 'none';
  } catch {
    // Storage blocked (private mode): start without a background.
    return 'none';
  }
}

export function rememberBackground(id: BackgroundChoice): void {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, id);
  } catch {
    // Not remembered: the next lesson starts without a background.
  }
}
