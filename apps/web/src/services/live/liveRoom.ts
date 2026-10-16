/**
 * The live room in the browser (ADR-0026): wraps `livekit-client` behind a small connection
 * that the room UI subscribes to, so the UI never touches LiveKit and tests use a fake.
 * `livekit-client` is loaded only when someone joins a room.
 *
 * - People carry their role, raised hand and floor as LiveKit attributes: the role and the
 *   floor are set by the server, the hand by the learner.
 * - Chat messages travel only through the room (data messages on the topic "chat"); nothing
 *   is stored.
 * - Remote audio plays through audio elements in `audioHost`.
 * - A camera background (story 18.3) is a processor on the local camera track; its library
 *   loads only when someone picks one.
 */
import type {
  DataPacket_Kind,
  LocalParticipant,
  LocalVideoTrack,
  Participant,
  RemoteParticipant,
  RemoteTrack,
  Room,
} from 'livekit-client';
import type { BackgroundProcessorWrapper } from '@livekit/track-processors';
import {
  BLUR_RADIUS,
  MEDIAPIPE_ASSETS,
  backgroundImage,
  type BackgroundId,
} from './backgrounds';

export type LiveSource = 'camera' | 'screen';

export interface LivePerson {
  identity: string;
  name: string;
  role: 'teacher' | 'learner';
  local: boolean;
  speaking: boolean;
  hand: boolean;
  /** A learner the teacher gave the floor. */
  floor: boolean;
  micOn: boolean;
  cameraOn: boolean;
  screenOn: boolean;
  /** The picture has arrived here and can be shown (a remote track is subscribed). */
  cameraReady: boolean;
  screenReady: boolean;
}

export interface LiveMessage {
  id: string;
  identity: string;
  name: string;
  text: string;
  at: number;
}

export type LiveStatus = 'connecting' | 'connected' | 'reconnecting' | 'disconnected';

export interface LiveState {
  status: LiveStatus;
  /** The teacher ended the session (the room was closed). */
  ended: boolean;
  people: LivePerson[];
  chat: LiveMessage[];
  /** This person may publish (teacher, or a learner with the floor). */
  canPublish: boolean;
}

export interface LiveConnection {
  state(): LiveState;
  subscribe(listener: (state: LiveState) => void): () => void;
  setMicrophone(on: boolean): Promise<void>;
  setCamera(on: boolean): Promise<void>;
  setScreenShare(on: boolean): Promise<void>;
  /** The background behind this person's camera picture; kept for when the camera starts. */
  setBackground(id: BackgroundId): Promise<void>;
  raiseHand(up: boolean): Promise<void>;
  send(text: string): Promise<void>;
  /** Shows a person's camera or screen in `element`; returns the detach. */
  attach(identity: string, source: LiveSource, element: HTMLVideoElement): () => void;
  disconnect(): void;
}

export type ConnectLive = (
  url: string,
  token: string,
  audioHost: HTMLElement
) => Promise<LiveConnection>;

/**
 * Whether this browser can share the screen. iOS (any browser on iPhone and iPad) and most
 * mobile browsers offer no screen capture to web pages.
 */
export function canShareScreen(
  devices: Pick<MediaDevices, 'getDisplayMedia'> | undefined = globalThis.navigator
    ?.mediaDevices
): boolean {
  return typeof devices?.getDisplayMedia === 'function';
}

export const MAX_MESSAGE_LENGTH = 500;
const MAX_MESSAGES = 200;
const CHAT_TOPIC = 'chat';

type LiveKit = typeof import('livekit-client');

class LiveKitConnection implements LiveConnection {
  private listeners = new Set<(state: LiveState) => void>();
  private chat: LiveMessage[] = [];
  private status: LiveStatus = 'connected';
  private ended = false;
  private background: BackgroundId = 'none';
  private snapshot: LiveState;
  private readonly encoder = new TextEncoder();
  private readonly decoder = new TextDecoder();

  constructor(
    private readonly lk: LiveKit,
    private readonly room: Room,
    private readonly audioHost: HTMLElement
  ) {
    this.snapshot = this.build();
    const E = lk.RoomEvent;
    const refresh = () => this.emit();
    for (const event of [
      E.ParticipantConnected,
      E.ParticipantDisconnected,
      E.TrackPublished,
      E.TrackUnpublished,
      E.TrackMuted,
      E.TrackUnmuted,
      E.LocalTrackPublished,
      E.LocalTrackUnpublished,
      E.ActiveSpeakersChanged,
      E.ParticipantAttributesChanged,
      E.ParticipantNameChanged,
    ] as const) {
      room.on(event, refresh);
    }
    room.on(E.TrackSubscribed, (track: RemoteTrack) => {
      if (track.kind === lk.Track.Kind.Audio) this.audioHost.append(track.attach());
      this.emit();
    });
    room.on(E.TrackUnsubscribed, (track: RemoteTrack) => {
      track.detach().forEach((element) => element.remove());
      this.emit();
    });
    room.on(E.ParticipantPermissionsChanged, (previous, participant) => {
      // A learner given the floor speaks right away; their raised hand is answered.
      if (participant === room.localParticipant) {
        const now = room.localParticipant.permissions?.canPublish ?? false;
        if (now && !previous?.canPublish) {
          void this.raiseHand(false);
          void this.setMicrophone(true).catch(() => undefined);
        }
      }
      this.emit();
    });
    room.on(
      E.DataReceived,
      (
        payload: Uint8Array,
        participant?: RemoteParticipant,
        _kind?: DataPacket_Kind,
        topic?: string
      ) => {
        if (topic !== CHAT_TOPIC || !participant) return;
        try {
          const { text } = JSON.parse(this.decoder.decode(payload)) as { text?: unknown };
          if (typeof text !== 'string' || !text.trim()) return;
          this.add(participant.identity, participant.name ?? '', text);
        } catch {
          // Not a chat message of ours: ignore it.
        }
      }
    );
    room.on(E.Reconnecting, () => {
      this.status = 'reconnecting';
      this.emit();
    });
    room.on(E.Reconnected, () => {
      this.status = 'connected';
      this.emit();
    });
    room.on(E.Disconnected, (reason) => {
      this.status = 'disconnected';
      this.ended = reason === lk.DisconnectReason.ROOM_DELETED;
      this.emit();
    });
  }

  state(): LiveState {
    return this.snapshot;
  }

  subscribe(listener: (state: LiveState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async setMicrophone(on: boolean): Promise<void> {
    await this.room.localParticipant.setMicrophoneEnabled(on);
    this.emit();
  }

  async setCamera(on: boolean): Promise<void> {
    await this.room.localParticipant.setCameraEnabled(on);
    if (on) await this.applyBackground();
    this.emit();
  }

  async setBackground(id: BackgroundId): Promise<void> {
    this.background = id;
    await this.applyBackground();
  }

  async setScreenShare(on: boolean): Promise<void> {
    await this.room.localParticipant.setScreenShareEnabled(on);
    this.emit();
  }

  async raiseHand(up: boolean): Promise<void> {
    await this.room.localParticipant.setAttributes({ hand: up ? 'up' : '' });
    this.emit();
  }

  async send(text: string): Promise<void> {
    const clean = text.trim().slice(0, MAX_MESSAGE_LENGTH);
    if (!clean) return;
    await this.room.localParticipant.publishData(
      this.encoder.encode(JSON.stringify({ text: clean })),
      { reliable: true, topic: CHAT_TOPIC }
    );
    const me = this.room.localParticipant;
    this.add(me.identity, me.name ?? '', clean);
  }

  attach(identity: string, source: LiveSource, element: HTMLVideoElement): () => void {
    const participant = this.participant(identity);
    const track = participant?.getTrackPublication(
      source === 'camera' ? this.lk.Track.Source.Camera : this.lk.Track.Source.ScreenShare
    )?.track;
    if (!track) return () => undefined;
    track.attach(element);
    return () => {
      track.detach(element);
    };
  }

  disconnect(): void {
    void this.room.disconnect();
  }

  /** Puts the chosen background on the camera track, if the camera is on. */
  private async applyBackground(): Promise<void> {
    const track = this.room.localParticipant.getTrackPublication(
      this.lk.Track.Source.Camera
    )?.track as LocalVideoTrack | undefined;
    if (!track) return;
    const current = track.getProcessor() as BackgroundProcessorWrapper | undefined;
    if (this.background === 'none') {
      if (current) await track.stopProcessor();
      return;
    }
    const image = backgroundImage(this.background);
    const options = image
      ? ({ mode: 'virtual-background', imagePath: image } as const)
      : ({ mode: 'background-blur', blurRadius: BLUR_RADIUS } as const);
    if (current && typeof current.switchTo === 'function') {
      await current.switchTo(options);
      return;
    }
    const { BackgroundProcessor } = await import('@livekit/track-processors');
    await track.setProcessor(
      BackgroundProcessor({ ...options, assetPaths: MEDIAPIPE_ASSETS })
    );
  }

  private participant(identity: string): Participant | undefined {
    if (identity === this.room.localParticipant.identity)
      return this.room.localParticipant;
    return this.room.getParticipantByIdentity(identity);
  }

  private add(identity: string, name: string, text: string) {
    this.chat = [
      ...this.chat,
      {
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        identity,
        name,
        text: text.slice(0, MAX_MESSAGE_LENGTH),
        at: Date.now(),
      },
    ].slice(-MAX_MESSAGES);
    this.emit();
  }

  private person(p: Participant, local: boolean): LivePerson {
    const attributes = p.attributes ?? {};
    return {
      identity: p.identity,
      name: p.name || p.identity,
      role: attributes.role === 'teacher' ? 'teacher' : 'learner',
      local,
      speaking: p.isSpeaking,
      hand: attributes.hand === 'up',
      floor: attributes.floor === 'yes',
      micOn: p.isMicrophoneEnabled,
      cameraOn: p.isCameraEnabled,
      screenOn: p.isScreenShareEnabled,
      cameraReady: Boolean(p.getTrackPublication(this.lk.Track.Source.Camera)?.track),
      screenReady: Boolean(
        p.getTrackPublication(this.lk.Track.Source.ScreenShare)?.track
      ),
    };
  }

  private build(): LiveState {
    const me: LocalParticipant = this.room.localParticipant;
    return {
      status: this.status,
      ended: this.ended,
      people: [
        this.person(me, true),
        ...[...this.room.remoteParticipants.values()].map((p) => this.person(p, false)),
      ],
      chat: this.chat,
      canPublish: me.permissions?.canPublish ?? false,
    };
  }

  private emit() {
    this.snapshot = this.build();
    for (const listener of this.listeners) listener(this.snapshot);
  }
}

/** Joins a LiveKit room; call it from a click, so the browser lets the sound play. */
export const connectLive: ConnectLive = async (url, token, audioHost) => {
  const lk = await import('livekit-client');
  const room = new lk.Room({ adaptiveStream: true, dynacast: true });
  try {
    await room.connect(url, token);
  } catch (error) {
    // Release whatever the failed attempt opened; the caller shows the error.
    await room.disconnect().catch(() => undefined);
    throw error;
  }
  await room.startAudio().catch(() => undefined);
  return new LiveKitConnection(lk, room, audioHost);
};
