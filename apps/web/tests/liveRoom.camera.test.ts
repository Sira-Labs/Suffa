import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BackgroundError, connectLive } from '@/services/live/liveRoom';

/**
 * Story 18.3: with a background chosen, the camera is published only once the background is
 * in place, so no unprocessed frame of the room ever leaves the device.
 */
const steps: string[] = [];
const state = { failProcessor: false, published: undefined as unknown };

function fakeTrack() {
  return {
    processor: undefined as unknown,
    getProcessor() {
      return this.processor;
    },
    async setProcessor(processor: unknown) {
      if (state.failProcessor) throw new Error('no webgl2');
      steps.push('processor');
      this.processor = processor;
    },
    async stopProcessor() {
      steps.push('stop-processor');
      this.processor = undefined;
    },
    stop() {
      steps.push('stop-track');
    },
  };
}

vi.mock('@livekit/track-processors', () => ({
  BackgroundProcessor: (options: { mode: string; imagePath?: string }) => ({
    options,
    switchTo: async (next: { mode: string }) => steps.push(`switch:${next.mode}`),
  }),
}));

vi.mock('livekit-client', () => {
  const Source = { Camera: 'camera', ScreenShare: 'screen_share' };
  class Room {
    options = { videoCaptureDefaults: { resolution: { width: 1280, height: 720 } } };
    remoteParticipants = new Map();
    localParticipant = {
      identity: 'me',
      name: 'Ustadha Maryam',
      attributes: {},
      permissions: { canPublish: true },
      isSpeaking: false,
      isMicrophoneEnabled: false,
      isCameraEnabled: false,
      isScreenShareEnabled: false,
      getTrackPublication: (source: string) =>
        source === Source.Camera && state.published
          ? { track: state.published }
          : undefined,
      publishTrack: async (track: unknown) => {
        steps.push('publish');
        state.published = track;
      },
      unpublishTrack: async () => {
        steps.push('unpublish');
        state.published = undefined;
      },
    };
    on() {
      return this;
    }
    async connect() {}
    async startAudio() {}
    async disconnect() {}
  }
  return {
    Room,
    RoomEvent: new Proxy({}, { get: (_target, name) => String(name) }),
    Track: { Source, Kind: { Audio: 'audio', Video: 'video' } },
    DisconnectReason: { ROOM_DELETED: 'room_deleted' },
    createLocalVideoTrack: async () => {
      steps.push('create');
      return fakeTrack();
    },
  };
});

const connect = () =>
  connectLive('wss://live.example.org', 'jwt', document.createElement('div'));

beforeEach(() => {
  steps.length = 0;
  state.failProcessor = false;
  state.published = undefined;
});

describe('camera with a background', () => {
  it('puts the background on before the camera is published', async () => {
    const live = await connect();
    await live.setBackground('mosque');
    expect(steps).toEqual([]);
    await live.setCamera(true);
    expect(steps).toEqual(['create', 'processor', 'publish']);
  });

  it('keeps the camera off when the background cannot be set up', async () => {
    const live = await connect();
    await live.setBackground('blur');
    state.failProcessor = true;
    await expect(live.setCamera(true)).rejects.toBeInstanceOf(BackgroundError);
    expect(steps).toEqual(['create', 'stop-track']);
    expect(state.published).toBeUndefined();
  });

  it('publishes a plain camera without a background, and unpublishes it when off', async () => {
    const live = await connect();
    await live.setCamera(true);
    expect(steps).toEqual(['create', 'publish']);
    await live.setCamera(false);
    expect(steps).toEqual(['create', 'publish', 'unpublish']);
  });

  it('switches or removes the background on a running camera', async () => {
    const live = await connect();
    await live.setBackground('stars');
    await live.setCamera(true);
    await live.setBackground('blur');
    await live.setBackground('none');
    expect(steps).toEqual([
      'create',
      'processor',
      'publish',
      'switch:background-blur',
      'stop-processor',
    ]);
  });

  it('keeps the earlier background when a new one fails on a running camera', async () => {
    const live = await connect();
    await live.setBackground('stars');
    await live.setCamera(true);
    // The running processor cannot switch to the new picture.
    const track = state.published as { processor: { switchTo: () => Promise<void> } };
    track.processor.switchTo = async () => {
      throw new Error('image did not load');
    };
    await expect(live.setBackground('mosque')).rejects.toBeInstanceOf(BackgroundError);
    // A restart of the camera still uses stars, not the background that failed.
    await live.setCamera(false);
    steps.length = 0;
    await live.setCamera(true);
    const restarted = state.published as {
      processor: { options: { imagePath?: string } };
    };
    expect(restarted.processor.options.imagePath).toBe('/live/backgrounds/stars.jpg');
  });
});
