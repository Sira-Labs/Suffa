import { beforeEach, describe, expect, it, vi } from 'vitest';
import { connectLive } from '@/services/live/liveRoom';

/**
 * The floor allows a learner's microphone; it never switches it on (ADR-0026, update
 * 2026-11-19): nobody is heard or recorded without their own doing.
 */
type Permissions = { canPublish: boolean; canPublishSources?: number[] };
// LiveKit's TrackSource values: 1 camera, 2 microphone.
const WITHOUT_FLOOR: Permissions = { canPublish: true, canPublishSources: [1] };
const WITH_FLOOR: Permissions = { canPublish: true, canPublishSources: [1, 2] };

const room = {
  permissions: WITHOUT_FLOOR,
  handlers: new Map<string, (...args: unknown[]) => void>(),
  setMicrophoneEnabled: vi.fn(async (_on: boolean) => undefined),
  /** The room's local participant, as LiveKit passes it to the handler. */
  local: undefined as unknown,
};

vi.mock('livekit-client', () => {
  class Room {
    remoteParticipants = new Map();
    localParticipant = {
      identity: 'me',
      name: 'Amina',
      attributes: { role: 'learner' },
      get permissions() {
        return room.permissions;
      },
      isSpeaking: false,
      isMicrophoneEnabled: false,
      isCameraEnabled: false,
      isScreenShareEnabled: false,
      getTrackPublication: () => undefined,
      setMicrophoneEnabled: (on: boolean) => room.setMicrophoneEnabled(on),
    };
    constructor() {
      room.local = this.localParticipant;
    }
    on(event: string, handler: (...args: unknown[]) => void) {
      room.handlers.set(event, handler);
      return this;
    }
    async connect() {}
    async startAudio() {}
    async disconnect() {}
  }
  return {
    Room,
    RoomEvent: new Proxy({}, { get: (_target, name) => String(name) }),
    Track: {
      Source: { Camera: 'camera', ScreenShare: 'screen_share' },
      Kind: { Audio: 'audio', Video: 'video' },
    },
    DisconnectReason: { ROOM_DELETED: 'room_deleted' },
  };
});

beforeEach(() => {
  room.permissions = WITHOUT_FLOOR;
  room.handlers.clear();
  room.setMicrophoneEnabled.mockClear();
});

describe('a learner given the floor', () => {
  it('may speak, and the microphone stays off until they switch it on', async () => {
    const connection = await connectLive(
      'wss://live.example.org',
      'jwt',
      document.createElement('div')
    );
    expect(connection.state().canSpeak).toBe(false);
    const states: boolean[] = [];
    connection.subscribe((state) => states.push(state.canSpeak));

    room.permissions = WITH_FLOOR;
    // As LiveKit calls it: the permissions before, and whose they are.
    room.handlers.get('ParticipantPermissionsChanged')!(WITHOUT_FLOOR, room.local);

    expect(states.at(-1)).toBe(true);
    expect(room.setMicrophoneEnabled).not.toHaveBeenCalled();

    await connection.setMicrophone(true);
    expect(room.setMicrophoneEnabled.mock.calls).toEqual([[true]]);
  });
});
