/**
 * The recording page of live lessons (ADR-0029), opened by LiveKit Egress in its own Chrome:
 * `live-record.html?url=…&token=…`. It joins the room as the hidden recorder, shows the
 * teacher's stage and plays every voice that may speak; Egress records what it shows and
 * plays.
 *
 * Signals to Egress (its template protocol): `START_RECORDING` on the console once the page is
 * in the room, `END_RECORDING` when the room is gone.
 */
import {
  Room,
  RoomEvent,
  Track,
  type RemoteParticipant,
  type RemoteTrack,
  type RemoteTrackPublication,
} from 'livekit-client';
import { stageOf, wantsTrack, type RecordedPerson } from './stage';

/** Egress listens for these exact lines on the page's console. */
function signal(line: 'START_RECORDING' | 'END_RECORDING') {
  // eslint-disable-next-line no-console -- the template protocol of LiveKit Egress
  console.log(line);
}

const isTeacher = (p: RemoteParticipant) => p.attributes?.role === 'teacher';

const hasPicture = (p: RemoteParticipant, source: Track.Source) =>
  Boolean(p.getTrackPublication(source)?.track);

function person(p: RemoteParticipant): RecordedPerson {
  return {
    identity: p.identity,
    teacher: isTeacher(p),
    screen: hasPicture(p, Track.Source.ScreenShare),
    camera: hasPicture(p, Track.Source.Camera),
  };
}

/**
 * Whether the recording takes this track. The room subscribes to everything (LiveKit only
 * connects a subscriber once there is something to receive); a learner's picture is given
 * back at once and never shown.
 */
function wanted(publication: RemoteTrackPublication, participant: RemoteParticipant) {
  const kind = publication.kind === Track.Kind.Audio ? 'audio' : 'video';
  return wantsTrack(kind, isTeacher(participant));
}

function show(element: HTMLVideoElement, track: RemoteTrack | undefined) {
  const current = element.srcObject as MediaStream | null;
  const same = current?.getTracks()[0] === track?.mediaStreamTrack;
  if (same) return;
  if (track) track.attach(element);
  else element.srcObject = null;
}

function render(room: Room) {
  const main = document.getElementById('main') as HTMLVideoElement;
  const pip = document.getElementById('pip') as HTMLVideoElement;
  const idle = document.getElementById('idle')!;
  const stage = stageOf([...room.remoteParticipants.values()].map(person));
  const teacher = stage.identity
    ? room.getParticipantByIdentity(stage.identity)
    : undefined;
  const track = (source: Track.Source) =>
    teacher?.getTrackPublication(source)?.track as RemoteTrack | undefined;
  show(
    main,
    stage.main === 'screen'
      ? track(Track.Source.ScreenShare)
      : stage.main === 'camera'
        ? track(Track.Source.Camera)
        : undefined
  );
  show(pip, stage.pip ? track(Track.Source.Camera) : undefined);
  main.hidden = stage.main === null;
  pip.hidden = !stage.pip;
  idle.hidden = stage.main !== null;
}

async function record(): Promise<void> {
  const params = new URLSearchParams(window.location.search);
  const url = params.get('url');
  const token = params.get('token');
  if (!url || !token) throw new Error('url and token are required');
  const room = new Room({ adaptiveStream: false, dynacast: false });
  const audio = document.getElementById('audio')!;
  const refresh = () => render(room);
  room
    .on(RoomEvent.TrackPublished, (publication, participant) => {
      if (!wanted(publication, participant)) publication.setSubscribed(false);
    })
    .on(RoomEvent.TrackSubscribed, (track, publication, participant) => {
      if (!wanted(publication, participant)) {
        publication.setSubscribed(false);
        return;
      }
      if (track.kind === Track.Kind.Audio) audio.append(track.attach());
      refresh();
    })
    .on(RoomEvent.TrackUnsubscribed, (track) => {
      if (track.kind === Track.Kind.Audio) track.detach().forEach((el) => el.remove());
      refresh();
    })
    .on(RoomEvent.TrackMuted, refresh)
    .on(RoomEvent.TrackUnmuted, refresh)
    .on(RoomEvent.ParticipantDisconnected, refresh)
    .on(RoomEvent.ParticipantAttributesChanged, refresh)
    .on(RoomEvent.Disconnected, () => {
      signal('END_RECORDING');
    });
  await room.connect(url, token);
  refresh();
  signal('START_RECORDING');
}

record().catch((error: unknown) => {
  // Egress keeps a page's console to itself but logs its uncaught exceptions (at debug level):
  // reported as one, the reason shows in the egress log as `chrome exception`.
  window.reportError(
    error instanceof Error ? error : new Error(`recording page failed: ${String(error)}`)
  );
  // Egress ends the recording instead of recording an empty page for hours.
  signal('END_RECORDING');
});
