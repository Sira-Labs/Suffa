/**
 * The LiveKit adapter (ADR-0026): what a join token allows a teacher and a learner, and how
 * room-service calls answer for rooms and participants that are not there.
 * The server part runs with SUFFA_TEST_LIVEKIT_URL (ws://…), SUFFA_TEST_LIVEKIT_KEY and
 * SUFFA_TEST_LIVEKIT_SECRET against a local `livekit-server`; skipped otherwise.
 */
import { describe, expect, it } from 'vitest';
import { TrackSource } from 'livekit-server-sdk';
import { LiveKitRooms, type RoomService } from '../src/live/rooms.js';

const config = {
  url: 'wss://live.example.org',
  apiUrl: 'https://live.example.org',
  apiKey: 'suffatest',
  apiSecret: 'test-secret-that-is-long-enough-0123456789',
};

/** The claims of a JWT (signature not checked: the LiveKit server does that). */
function claims(jwt: string): Record<string, unknown> {
  const [, payload] = jwt.split('.');
  return JSON.parse(Buffer.from(payload!, 'base64url').toString('utf8'));
}

describe('LiveKit join tokens', () => {
  const rooms = new LiveKitRooms(config);

  it('lets the teacher publish camera, microphone and screen and moderate the room', async () => {
    const jwt = await rooms.token(
      'live-1',
      { identity: 'u-teacher', name: 'Lehrerin', role: 'teacher' },
      3600
    );
    const c = claims(jwt);
    expect(c).toMatchObject({
      sub: 'u-teacher',
      name: 'Lehrerin',
      iss: 'suffatest',
      attributes: { role: 'teacher' },
      video: {
        room: 'live-1',
        roomJoin: true,
        roomAdmin: true,
        canPublish: true,
        canSubscribe: true,
        canPublishData: true,
        canPublishSources: ['camera', 'microphone', 'screen_share', 'screen_share_audio'],
      },
    });
    expect((c.exp as number) - (c.nbf as number)).toBe(3600);
  });

  it('lets a learner listen and chat, but publish nothing without cameras and write no attributes', async () => {
    const c = claims(
      await rooms.token(
        'live-1',
        { identity: 'u-1', name: 'Amina', role: 'learner' },
        600
      )
    );
    expect(c).toMatchObject({
      attributes: { role: 'learner' },
      video: {
        roomAdmin: false,
        canPublish: false,
        canSubscribe: true,
        canPublishData: true,
        // Role, floor and hand are attributes the room trusts: a learner cannot write them.
        canUpdateOwnMetadata: false,
      },
    });
    expect(
      (c.video as { canPublishSources?: unknown[] }).canPublishSources ?? []
    ).toEqual([]);
  });

  it('lets a learner use their own camera, but not the microphone, where cameras are allowed', async () => {
    const c = claims(
      await rooms.token(
        'live-1',
        { identity: 'u-1', name: 'Amina', role: 'learner', camera: true },
        600
      )
    );
    expect(c).toMatchObject({
      video: { roomAdmin: false, canPublish: true, canPublishSources: ['camera'] },
    });
  });
});

// The suite's body is collected even when it is skipped, so nothing in it may need the server.
const server = process.env.SUFFA_TEST_LIVEKIT_URL ?? '';

describe('what the adapter sends to the room service', () => {
  function setup() {
    const calls: unknown[][] = [];
    const service: RoomService = {
      updateParticipant: async (...args: unknown[]) => {
        calls.push(args);
        return undefined as never;
      },
      deleteRoom: async () => undefined,
    };
    return { calls, rooms: new LiveKitRooms(config, service) };
  }

  it('gives and takes the floor without the right to write attributes, and lowers the hand', async () => {
    const { calls, rooms } = setup();
    expect(await rooms.setFloor('live-1', 'u-1', true, { camera: true })).toBe(true);
    expect(await rooms.setFloor('live-1', 'u-1', false, { camera: false })).toBe(true);
    expect(calls).toEqual([
      [
        'live-1',
        'u-1',
        {
          permission: {
            canSubscribe: true,
            canPublish: true,
            canPublishSources: [TrackSource.CAMERA, TrackSource.MICROPHONE],
            canPublishData: true,
            canUpdateMetadata: false,
          },
          attributes: { floor: 'yes', hand: '' },
        },
      ],
      [
        'live-1',
        'u-1',
        {
          permission: {
            canSubscribe: true,
            canPublish: false,
            canPublishSources: [],
            canPublishData: true,
            canUpdateMetadata: false,
          },
          attributes: { floor: '', hand: '' },
        },
      ],
    ]);
  });

  it('sets a hand as an attribute only, leaving the permissions alone', async () => {
    const { calls, rooms } = setup();
    expect(await rooms.setHand('live-1', 'u-1', true)).toBe(true);
    expect(await rooms.setHand('live-1', 'u-1', false)).toBe(true);
    expect(calls).toEqual([
      ['live-1', 'u-1', { attributes: { hand: 'up' } }],
      ['live-1', 'u-1', { attributes: { hand: '' } }],
    ]);
  });

  it('answers false when the person is not in the room, and passes other errors on', async () => {
    const service: RoomService = {
      updateParticipant: async () => {
        throw Object.assign(new Error('participant does not exist'), { status: 404 });
      },
      deleteRoom: async () => undefined,
    };
    const rooms = new LiveKitRooms(config, service);
    expect(await rooms.setHand('live-1', 'u-gone', true)).toBe(false);
    const broken = new LiveKitRooms(config, {
      ...service,
      updateParticipant: async () => {
        throw new TypeError('fetch failed');
      },
    });
    await expect(broken.setHand('live-1', 'u-1', true)).rejects.toThrow(TypeError);
  });
});

describe.skipIf(!server)('LiveKit room service (local server)', () => {
  const rooms = new LiveKitRooms({
    url: server,
    apiUrl: server.replace(/^ws/, 'http'),
    apiKey: process.env.SUFFA_TEST_LIVEKIT_KEY ?? '',
    apiSecret: process.env.SUFFA_TEST_LIVEKIT_SECRET ?? '',
  });

  it('answers false for a learner who is not in the room', async () => {
    expect(await rooms.setFloor('live-nobody-here', 'u-1', true, { camera: true })).toBe(
      false
    );
  });

  it('closes a room that is already gone without an error', async () => {
    await expect(rooms.close('live-nobody-here')).resolves.toBeUndefined();
  });
});
