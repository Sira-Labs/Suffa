import { describe, expect, it, vi } from 'vitest';
import { connectLive } from '@/services/live/liveRoom';

/** A room whose connection fails (for example an expired token). */
const rooms: { disconnect: ReturnType<typeof vi.fn> }[] = [];
vi.mock('livekit-client', () => ({
  Room: class {
    disconnect = vi.fn(async () => undefined);
    constructor() {
      rooms.push(this);
    }
    async connect() {
      throw new Error('could not establish signal connection');
    }
  },
}));

describe('connectLive', () => {
  it('releases the room when connecting fails and passes the error on', async () => {
    await expect(
      connectLive('wss://live.example.org', 'jwt', document.createElement('div'))
    ).rejects.toThrow('could not establish signal connection');
    expect(rooms).toHaveLength(1);
    expect(rooms[0]!.disconnect).toHaveBeenCalledOnce();
  });
});
