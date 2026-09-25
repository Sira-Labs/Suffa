/**
 * Lock-screen and notification controls for class recordings (story 13.3) through the Media
 * Session API, which browsers and the app's web view both offer. Where it is missing nothing
 * happens; playback itself does not depend on it.
 */
import { useEffect, type RefObject } from 'react';

const SKIP_SEC = 10;

type Session = Pick<MediaSession, 'metadata' | 'setActionHandler'>;

/** Shows the recording and wires play/pause/skip to the element; returns the cleanup. */
export function announceNowPlaying(
  session: Session | undefined,
  title: string,
  element: () => HTMLMediaElement | null
): () => void {
  if (!session || typeof MediaMetadata === 'undefined') return () => undefined;
  session.metadata = new MediaMetadata({
    title,
    artist: 'Suffa',
    artwork: [{ src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' }],
  });
  const seek = (delta: number) => () => {
    const el = element();
    if (el) el.currentTime = Math.max(0, el.currentTime + delta);
  };
  const actions: [MediaSessionAction, MediaSessionActionHandler][] = [
    ['play', () => void element()?.play()],
    ['pause', () => element()?.pause()],
    ['seekbackward', seek(-SKIP_SEC)],
    ['seekforward', seek(SKIP_SEC)],
  ];
  for (const [action, handler] of actions) {
    try {
      session.setActionHandler(action, handler);
    } catch (error) {
      // Older engines reject actions they do not know; the others still work.
      if (!(error instanceof TypeError)) throw error;
    }
  }
  return () => {
    session.metadata = null;
    for (const [action] of actions) {
      try {
        session.setActionHandler(action, null);
      } catch (error) {
        if (!(error instanceof TypeError)) throw error;
      }
    }
  };
}

export function useMediaSession(
  title: string | undefined,
  element: RefObject<HTMLMediaElement | null>
): void {
  useEffect(() => {
    if (!title || typeof navigator === 'undefined') return;
    return announceNowPlaying(navigator.mediaSession, title, () => element.current);
  }, [title, element]);
}
