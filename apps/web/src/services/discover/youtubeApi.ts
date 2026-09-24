/**
 * The YouTube IFrame Player API, loaded once on demand. It only attaches to embeds that
 * already play (enablejsapi=1), so the video works without it; the API adds reading the
 * position so the learner can continue later.
 */

/** The parts of YT.Player the app uses. */
export interface YouTubePlayer {
  getCurrentTime(): number;
  getDuration(): number;
  getPlaylistIndex?(): number;
  destroy(): void;
}

interface YouTubeNamespace {
  Player: new (
    element: HTMLIFrameElement,
    options: { events?: { onStateChange?: (event: { data: number }) => void } }
  ) => YouTubePlayer;
  PlayerState: { ENDED: number; PLAYING: number; PAUSED: number };
}

declare global {
  interface Window {
    YT?: YouTubeNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

const API_URL = 'https://www.youtube.com/iframe_api';
let loading: Promise<YouTubeNamespace> | null = null;

export function loadYouTubeApi(timeoutMs = 10_000): Promise<YouTubeNamespace> {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  loading ??= new Promise<YouTubeNamespace>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      loading = null;
      reject(new Error('YouTube API did not load in time'));
    }, timeoutMs);
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previous?.();
      window.clearTimeout(timer);
      if (window.YT) resolve(window.YT);
    };
    const script = document.createElement('script');
    script.src = API_URL;
    script.async = true;
    script.onerror = () => {
      window.clearTimeout(timer);
      loading = null;
      reject(new Error('YouTube API could not be loaded'));
    };
    document.head.appendChild(script);
  });
  return loading;
}
