/**
 * The LiveKit server behind live lessons (ADR-0026): signs join tokens and changes what a
 * participant may publish. Only this file talks to LiveKit, so routes and tests depend on
 * the small `LiveRooms` interface.
 *
 * Who may do what in a room:
 * - the teacher publishes camera, microphone and screen and moderates the room;
 * - a learner joins listening; chat and raised hands go through data messages and their own
 *   attributes; the teacher gives them the floor (microphone, and the camera unless the
 *   session keeps learner cameras off) and takes it back.
 */
import { AccessToken, RoomServiceClient, TrackSource } from 'livekit-server-sdk';
import type { LiveKitConfig } from '../config.js';

export type LiveRole = 'teacher' | 'learner';

export interface LiveParticipant {
  /** The Suffa user id; one connection per user and room. */
  identity: string;
  name: string;
  role: LiveRole;
}

export interface LiveRooms {
  /** Where browsers connect (wss://…). */
  readonly url: string;
  /** A token to join `room`, valid for `ttlSeconds`. */
  token(room: string, who: LiveParticipant, ttlSeconds: number): Promise<string>;
  /**
   * Gives a learner the floor (microphone, and the camera when `camera`) or takes it back.
   * False when the learner is not in the room.
   */
  setFloor(
    room: string,
    identity: string,
    allowed: boolean,
    options: { camera: boolean }
  ): Promise<boolean>;
  /** Ends the room for everyone in it (no error when it is already gone). */
  close(room: string): Promise<void>;
}

const TEACHER_SOURCES = [
  TrackSource.CAMERA,
  TrackSource.MICROPHONE,
  TrackSource.SCREEN_SHARE,
  TrackSource.SCREEN_SHARE_AUDIO,
];
const FLOOR_SOURCES = [TrackSource.CAMERA, TrackSource.MICROPHONE];
// Sessions with the learners' cameras off (ADR-0026, stage 2): the floor is the voice only.
const VOICE_SOURCES = [TrackSource.MICROPHONE];

/** LiveKit answers "not found" for a room or participant that is not (or no longer) there. */
function isNotFound(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const { status, code } = error as { status?: number; code?: string };
  return status === 404 || code === 'not_found';
}

export class LiveKitRooms implements LiveRooms {
  readonly url: string;
  private readonly service: RoomServiceClient;

  constructor(private readonly config: LiveKitConfig) {
    this.url = config.url;
    this.service = new RoomServiceClient(config.apiUrl, config.apiKey, config.apiSecret);
  }

  async token(room: string, who: LiveParticipant, ttlSeconds: number): Promise<string> {
    const token = new AccessToken(this.config.apiKey, this.config.apiSecret, {
      identity: who.identity,
      name: who.name,
      ttl: ttlSeconds,
      attributes: { role: who.role },
    });
    const teacher = who.role === 'teacher';
    token.addGrant({
      room,
      roomJoin: true,
      roomAdmin: teacher,
      canSubscribe: true,
      canPublish: teacher,
      canPublishSources: teacher ? TEACHER_SOURCES : [],
      canPublishData: true,
      // The raised hand is the learner's own attribute.
      canUpdateOwnMetadata: true,
    });
    return token.toJwt();
  }

  async setFloor(
    room: string,
    identity: string,
    allowed: boolean,
    options: { camera: boolean }
  ): Promise<boolean> {
    try {
      await this.service.updateParticipant(room, identity, {
        // Permissions are replaced as a whole.
        permission: {
          canSubscribe: true,
          canPublish: allowed,
          canPublishSources: !allowed
            ? []
            : options.camera
              ? FLOOR_SOURCES
              : VOICE_SOURCES,
          canPublishData: true,
          canUpdateMetadata: true,
        },
        attributes: { floor: allowed ? 'yes' : '' },
      });
      return true;
    } catch (error) {
      if (isNotFound(error)) return false;
      throw error;
    }
  }

  async close(room: string): Promise<void> {
    try {
      await this.service.deleteRoom(room);
    } catch (error) {
      if (!isNotFound(error)) throw error;
    }
  }
}
