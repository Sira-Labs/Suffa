import { describe, expect, it, vi } from 'vitest';
import { attachPlayer, type YouTubeNamespace } from './youtubeApi';

describe('attachPlayer', () => {
  it('talks to the host the embed comes from (youtube-nocookie.com)', () => {
    const Player = vi.fn();
    const YT = {
      Player,
      PlayerState: { ENDED: 0, PLAYING: 1, PAUSED: 2 },
    } as unknown as YouTubeNamespace;
    const frame = document.createElement('iframe');
    frame.src = 'https://www.youtube-nocookie.com/embed/abc?enablejsapi=1';
    const onState = vi.fn();

    attachPlayer(YT, frame, onState);

    expect(Player).toHaveBeenCalledWith(
      frame,
      expect.objectContaining({ host: 'https://www.youtube-nocookie.com' })
    );
    const options = Player.mock.calls[0]![1] as {
      events: { onStateChange: (e: { data: number }) => void };
    };
    options.events.onStateChange({ data: 2 });
    expect(onState).toHaveBeenCalledWith(2);
  });
});
