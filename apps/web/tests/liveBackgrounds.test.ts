import { afterEach, describe, expect, it } from 'vitest';
import {
  BACKGROUNDS,
  backgroundImage,
  canUseBackgrounds,
  isBackgroundId,
  rememberBackground,
  rememberedBackground,
} from '@/services/live/backgrounds';

/** Story 18.3: the camera backgrounds of the live room. */
afterEach(() => localStorage.removeItem('suffa.liveBackground'));

describe('camera backgrounds', () => {
  it('has none, blur and our pictures, each picture shipped with the app', () => {
    expect(BACKGROUNDS).toEqual(['none', 'blur', 'stars', 'arches', 'mosque', 'lattice']);
    expect(backgroundImage('none')).toBeNull();
    expect(backgroundImage('blur')).toBeNull();
    expect(backgroundImage('mosque')).toBe('/live/backgrounds/mosque.jpg');
    expect(isBackgroundId('lattice')).toBe(true);
    expect(isBackgroundId('beach')).toBe(false);
  });

  it('remembers the last pick and ignores anything else in storage', () => {
    expect(rememberedBackground()).toBe('none');
    rememberBackground('stars');
    expect(rememberedBackground()).toBe('stars');
    localStorage.setItem('suffa.liveBackground', 'beach');
    expect(rememberedBackground()).toBe('none');
  });

  it('needs WebGL 2 and video frames', () => {
    // jsdom has neither.
    expect(canUseBackgrounds()).toBe(false);
    const canvas = { getContext: (kind: string) => (kind === 'webgl2' ? {} : null) };
    const capable = {
      OffscreenCanvas: class {},
      VideoFrame: class {},
      createImageBitmap: () => undefined,
      MediaStreamTrackProcessor: class {},
      MediaStreamTrackGenerator: class {},
      document: { createElement: () => canvas },
    } as unknown as typeof globalThis;
    expect(canUseBackgrounds(capable)).toBe(true);
    const noGl = {
      ...capable,
      document: { createElement: () => ({ getContext: () => null }) },
    } as unknown as typeof globalThis;
    expect(canUseBackgrounds(noGl)).toBe(false);
  });
});
