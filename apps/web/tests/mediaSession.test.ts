import { afterEach, describe, expect, it, vi } from 'vitest';
import { announceNowPlaying } from '@/services/media/mediaSession';

class FakeMetadata {
  constructor(readonly init: MediaMetadataInit) {}
}

describe('lock-screen controls (story 13.3)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('shows the recording and controls the element, then clears both', () => {
    vi.stubGlobal('MediaMetadata', FakeMetadata);
    const handlers = new Map<string, MediaSessionActionHandler | null>();
    const session = {
      metadata: null as MediaMetadata | null,
      setActionHandler: (
        action: MediaSessionAction,
        h: MediaSessionActionHandler | null
      ) => {
        if (action === 'seekforward' && h === null) throw new TypeError('unknown action');
        handlers.set(action, h);
      },
    };
    const el = { currentTime: 5, pause: vi.fn(), play: vi.fn(async () => undefined) };
    const stop = announceNowPlaying(
      session,
      'Lektion 3',
      () => el as unknown as HTMLMediaElement
    );
    expect((session.metadata as unknown as FakeMetadata).init.title).toBe('Lektion 3');
    handlers.get('seekbackward')!({ action: 'seekbackward' });
    expect(el.currentTime).toBe(0);
    handlers.get('seekforward')!({ action: 'seekforward' });
    expect(el.currentTime).toBe(10);
    handlers.get('pause')!({ action: 'pause' });
    expect(el.pause).toHaveBeenCalled();
    stop();
    expect(session.metadata).toBeNull();
    expect(handlers.get('play')).toBeNull();
  });

  it('does nothing without the API', () => {
    expect(announceNowPlaying(undefined, 'x', () => null)).toBeTypeOf('function');
  });
});
