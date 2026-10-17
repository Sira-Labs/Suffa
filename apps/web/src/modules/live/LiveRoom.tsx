/**
 * The live room (ADR-0026): the teacher large on the stage (screen share before camera, with
 * the teacher's camera small in the corner while sharing, story 18.3), learners who have the
 * floor as small tiles, the people with raised hands, the chat and the controls. The teacher
 * gives and takes the floor; learners raise their hand. Whoever may use the camera can put a
 * background behind it: one of ours, or a picture of their own kept on this device.
 *
 * Recording (ADR-0029): the teacher starts and stops it; everyone in the room sees
 * „Aufnahme läuft“ while it runs and is told before joining that the lesson may be recorded.
 *
 * Joining starts from a click so the browser lets the room's sound play.
 */
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useParams } from 'react-router-dom';
import { LiveApi, type LiveRole, type LiveSession } from '@/services/live/liveApi';
import { SessionTags } from './LiveSessions';
import {
  BACKGROUNDS,
  backgroundImage,
  cameraBackground,
  canUseBackgrounds,
  isOwnChoice,
  ownChoice,
  ownIdOf,
  rememberBackground,
  rememberedBackground,
  type BackgroundChoice,
} from '@/services/live/backgrounds';
import {
  deviceBackgrounds,
  MAX_OWN_BACKGROUNDS,
  OwnBackgroundError,
  type OwnBackgroundStore,
} from '@/services/live/ownBackgrounds';
import {
  BackgroundError,
  canShareScreen,
  connectLive,
  MAX_MESSAGE_LENGTH,
  type ConnectLive,
  type LiveConnection,
  type LivePerson,
  type LiveSource,
  type LiveState,
} from '@/services/live/liveRoom';

type Phase =
  | { kind: 'ready' }
  | { kind: 'joining' }
  | { kind: 'error'; message: string }
  | { kind: 'room'; role: LiveRole; session: LiveSession; connection: LiveConnection }
  | { kind: 'left' };

function useConnectionState(connection: LiveConnection): LiveState {
  const [state, setState] = useState(() => connection.state());
  useEffect(() => {
    setState(connection.state());
    return connection.subscribe(setState);
  }, [connection]);
  return state;
}

/** A person's camera or screen. */
function Video({
  connection,
  person,
  source,
  label,
}: {
  connection: LiveConnection;
  person: LivePerson;
  source: LiveSource;
  label: string;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  // Attach once the picture has arrived; a remote track comes a moment after it is announced.
  const on = source === 'camera' ? person.cameraReady : person.screenReady;
  useEffect(() => {
    if (!on || !ref.current) return;
    return connection.attach(person.identity, source, ref.current);
  }, [connection, person.identity, source, on]);
  return (
    <video
      ref={ref}
      className="live-video"
      autoPlay
      playsInline
      muted={person.local}
      aria-label={label}
    />
  );
}

function Stage({
  connection,
  teacher,
}: {
  connection: LiveConnection;
  teacher: LivePerson | undefined;
}) {
  const { t } = useTranslation('live');
  // Everyone decides for themselves whether the teacher's camera covers a corner of the screen.
  const [showCamera, setShowCamera] = useState(true);
  if (!teacher) {
    return (
      <div className="live-stage live-stage-empty">
        <p>{t('room.waitingForTeacher')}</p>
      </div>
    );
  }
  const source: LiveSource | null = teacher.screenOn
    ? 'screen'
    : teacher.cameraOn
      ? 'camera'
      : null;
  const both = teacher.screenOn && teacher.cameraOn;
  return (
    <div className={`live-stage${teacher.speaking ? ' live-speaking' : ''}`}>
      {source ? (
        <Video
          connection={connection}
          person={teacher}
          source={source}
          label={
            source === 'screen'
              ? t('room.screenOf', { name: teacher.name })
              : teacher.name
          }
        />
      ) : (
        <p className="live-stage-empty">
          <strong>{teacher.name}</strong>
          <span>{t('room.teacherCameraOff')}</span>
        </p>
      )}
      {both && showCamera && (
        <div className="live-pip">
          <Video
            connection={connection}
            person={teacher}
            source="camera"
            label={teacher.name}
          />
        </div>
      )}
      {both && (
        <button
          className="btn btn-small live-pip-toggle"
          aria-pressed={showCamera}
          onClick={() => setShowCamera(!showCamera)}
        >
          {showCamera ? t('room.hideTeacherCamera') : t('room.showTeacherCamera')}
        </button>
      )}
    </div>
  );
}

interface OwnPicture {
  id: string;
  /** An object URL of the picture, for the preview and the camera. */
  url: string;
}

/**
 * The person's own background pictures, each with an object URL; null while loading. The URLs
 * are given back when a picture is deleted or the room is left.
 */
function useOwnBackgrounds(store: OwnBackgroundStore) {
  const [pictures, setPictures] = useState<OwnPicture[] | null>(null);
  const urls = useRef(new Map<string, string>());
  useEffect(() => {
    let active = true;
    const known = urls.current;
    store
      .list()
      .then((list) => {
        if (!active) return;
        const loaded = list.map((b) => ({ id: b.id, url: URL.createObjectURL(b.image) }));
        for (const picture of loaded) known.set(picture.id, picture.url);
        setPictures(loaded);
      })
      // Storage unavailable (private mode): only our backgrounds.
      .catch(() => active && setPictures([]));
    return () => {
      active = false;
      for (const url of known.values()) URL.revokeObjectURL(url);
      known.clear();
    };
  }, [store]);
  const add = async (file: File): Promise<OwnPicture> => {
    const added = await store.add(file);
    const picture = { id: added.id, url: URL.createObjectURL(added.image) };
    urls.current.set(picture.id, picture.url);
    setPictures((current) => [...(current ?? []), picture]);
    return picture;
  };
  const remove = async (id: string): Promise<void> => {
    await store.remove(id);
    const url = urls.current.get(id);
    if (url) URL.revokeObjectURL(url);
    urls.current.delete(id);
    setPictures((current) => current?.filter((p) => p.id !== id) ?? current);
  };
  const urlOf = (id: string) => urls.current.get(id);
  return { pictures, add, remove, urlOf };
}

/**
 * Blur or a picture behind the camera, as a row of small previews: ours, then the person's
 * own, each of those with a button to delete it, and a way to add one.
 */
function BackgroundPicker({
  value,
  busy,
  own,
  onChange,
  onAdd,
  onRemove,
}: {
  value: BackgroundChoice;
  busy: boolean;
  own: OwnPicture[];
  onChange: (choice: BackgroundChoice) => void;
  onAdd: (file: File) => void;
  onRemove: (id: string) => void;
}) {
  const { t } = useTranslation('live');
  const ownName = (id: string) =>
    t('backgrounds.own', { n: own.findIndex((p) => p.id === id) + 1 });
  const label = isOwnChoice(value) ? ownName(ownIdOf(value)) : t(`backgrounds.${value}`);
  const full = own.length >= MAX_OWN_BACKGROUNDS;
  return (
    <details className="card live-backgrounds">
      <summary>
        {t('room.background')}: {label}
      </summary>
      <fieldset className="live-background-list" disabled={busy}>
        <legend className="visually-hidden">{t('room.background')}</legend>
        {BACKGROUNDS.map((id) => {
          const image = backgroundImage(id);
          return (
            <label key={id} className="live-background">
              <input
                type="radio"
                name="live-background"
                value={id}
                checked={value === id}
                onChange={() => onChange(id)}
              />
              <span
                className={`live-background-preview live-background-${id}`}
                style={image ? { backgroundImage: `url(${image})` } : undefined}
                aria-hidden="true"
              />
              <span>{t(`backgrounds.${id}`)}</span>
            </label>
          );
        })}
        {own.map((picture) => {
          const choice = ownChoice(picture.id);
          const name = ownName(picture.id);
          return (
            <div key={picture.id} className="live-background-own">
              <label className="live-background">
                <input
                  type="radio"
                  name="live-background"
                  value={choice}
                  checked={value === choice}
                  onChange={() => onChange(choice)}
                />
                <span
                  className="live-background-preview"
                  style={{ backgroundImage: `url(${picture.url})` }}
                  aria-hidden="true"
                />
                <span>{name}</span>
              </label>
              <button
                type="button"
                className="btn btn-small live-background-remove"
                aria-label={t('room.removeBackground', { name })}
                onClick={() => onRemove(picture.id)}
              >
                ×
              </button>
            </div>
          );
        })}
      </fieldset>
      {full ? (
        <p className="muted live-background-note">
          {t('room.ownBackgroundsFull', { max: MAX_OWN_BACKGROUNDS })}
        </p>
      ) : (
        <label className="btn btn-small live-background-add">
          {t('room.addBackground')}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="visually-hidden"
            disabled={busy}
            onChange={(event) => {
              const file = event.target.files?.[0];
              // The same file can be chosen again after an error.
              event.target.value = '';
              if (file) onAdd(file);
            }}
          />
        </label>
      )}
      <p className="muted live-background-note">
        {t('room.backgroundNote')}{' '}
        {t('room.ownBackgroundsNote', { max: MAX_OWN_BACKGROUNDS })}
      </p>
    </details>
  );
}

function People({
  people,
  teacherView,
  onFloor,
}: {
  people: LivePerson[];
  teacherView: boolean;
  onFloor: (person: LivePerson, allowed: boolean) => void;
}) {
  const { t } = useTranslation('live');
  const learners = people.filter((p) => p.role === 'learner');
  const hands = learners.filter((p) => p.hand && !p.floor);
  const withFloor = learners.filter((p) => p.floor);
  const line = (p: LivePerson) => (
    <li key={p.identity} className="row live-person">
      <span>
        {p.name} {p.local && <span className="muted">{t('room.you')}</span>}
        {p.hand && <span className="live-tag">✋ {t('room.handRaised')}</span>}
        {p.speaking && <span className="live-tag">{t('room.speaking')}</span>}
      </span>
      {teacherView && !p.local && (
        <button className="btn btn-small" onClick={() => onFloor(p, !p.floor)}>
          {p.floor ? t('room.takeFloor') : t('room.giveFloor')}
        </button>
      )}
    </li>
  );
  return (
    <section className="card stack live-people" aria-labelledby="live-people">
      <h2 id="live-people" className="eyebrow">
        {t('room.people', { count: people.length })}
      </h2>
      {teacherView && (
        <>
          <h3>{t('room.hands')}</h3>
          {hands.length === 0 ? (
            <p className="muted">{t('room.noHands')}</p>
          ) : (
            <ul className="stack">{hands.map(line)}</ul>
          )}
        </>
      )}
      <ul className="stack">
        {[
          ...withFloor,
          ...learners.filter((p) => !p.floor && !(teacherView && p.hand)),
        ].map(line)}
      </ul>
    </section>
  );
}

function Chat({ state, connection }: { state: LiveState; connection: LiveConnection }) {
  const { t } = useTranslation('live');
  const [text, setText] = useState('');
  const list = useRef<HTMLOListElement>(null);
  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight });
  }, [state.chat.length]);
  const send = async (event: FormEvent) => {
    event.preventDefault();
    if (!text.trim()) return;
    await connection.send(text);
    setText('');
  };
  return (
    <section className="card stack live-chat" aria-labelledby="live-chat">
      <h2 id="live-chat" className="eyebrow">
        {t('room.chat')}
      </h2>
      {state.chat.length === 0 ? (
        <p className="muted">{t('room.chatEmpty')}</p>
      ) : (
        <ol ref={list} className="stack live-messages" aria-live="polite">
          {state.chat.map((m) => (
            <li key={m.id}>
              <strong>{m.name}</strong> <span dir="auto">{m.text}</span>
            </li>
          ))}
        </ol>
      )}
      <form className="row" onSubmit={send}>
        <input
          aria-label={t('room.message')}
          value={text}
          maxLength={MAX_MESSAGE_LENGTH}
          dir="auto"
          onChange={(e) => setText(e.target.value)}
        />
        <button className="btn" type="submit" disabled={!text.trim()}>
          {t('room.send')}
        </button>
      </form>
    </section>
  );
}

function Room({
  api,
  classId,
  session,
  role,
  connection,
  screenShare,
  backgrounds,
  ownBackgrounds,
  recordingEnabled,
  onLeave,
}: {
  api: LiveApi;
  classId: string;
  session: LiveSession;
  role: LiveRole;
  connection: LiveConnection;
  screenShare: boolean;
  backgrounds: boolean;
  ownBackgrounds: OwnBackgroundStore;
  /** The teacher can record the lesson on the server. */
  recordingEnabled: boolean;
  onLeave: () => void;
}) {
  const { t } = useTranslation('live');
  const state = useConnectionState(connection);
  const [notice, setNotice] = useState<string | null>(null);
  const me = state.people.find((p) => p.local);
  const teacher = state.people.find((p) => p.role === 'teacher');
  const teacherView = role === 'teacher';
  const floorTiles = state.people.filter((p) => p.role === 'learner' && p.cameraOn);
  const mayUseCamera = teacherView || (state.canPublish && session.learnerCameras);
  const [background, setBackground] = useState<BackgroundChoice>(() =>
    backgrounds ? rememberedBackground() : 'none'
  );
  const own = useOwnBackgrounds(ownBackgrounds);
  const [backgroundBusy, setBackgroundBusy] = useState(false);
  // What the teacher asked the server for; the room reports the egress a moment later.
  const [recordingWanted, setRecordingWanted] = useState(session.recording);
  const [recordingBusy, setRecordingBusy] = useState(false);
  // Shown while the egress runs, and for the teacher from the moment it was asked for.
  const recording = state.recording || (teacherView && recordingWanted);

  const hadFloor = useRef(false);
  useEffect(() => {
    if (!teacherView && state.canPublish && !hadFloor.current) {
      setNotice(t(state.recording ? 'room.floorGivenRecording' : 'room.floorGiven'));
    }
    hadFloor.current = state.canPublish;
  }, [state.canPublish, state.recording, teacherView, t]);

  // Learners are told when the recording starts or stops while they are in the room.
  const wasRecording = useRef(state.recording);
  useEffect(() => {
    if (state.recording !== wasRecording.current && !teacherView) {
      setNotice(t(state.recording ? 'room.recordingStarted' : 'room.recordingStopped'));
    }
    wasRecording.current = state.recording;
  }, [state.recording, teacherView, t]);

  const device = async (action: () => Promise<void>) => {
    try {
      await action();
    } catch (error) {
      setNotice(
        t(error instanceof BackgroundError ? 'room.cameraBlocked' : 'room.deviceError')
      );
    }
  };

  // The background picked last time comes back with the camera in this lesson too, once the
  // own pictures are loaded (it may be one of them).
  const restored = useRef(false);
  useEffect(() => {
    if (restored.current || own.pictures === null) return;
    restored.current = true;
    if (background === 'none') return;
    const camera = cameraBackground(background, own.urlOf);
    if (!camera) {
      // That picture was deleted on this device.
      setBackground('none');
      return;
    }
    void connection.setBackground(camera).catch(() => undefined);
    // Only once per connection: later picks go through pickBackground.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connection, own.pictures]);
  const pickBackground = async (choice: BackgroundChoice, urlOf = own.urlOf) => {
    const previous = background;
    setBackground(choice);
    setBackgroundBusy(true);
    try {
      await connection.setBackground(cameraBackground(choice, urlOf) ?? { kind: 'none' });
      // Only a background that is really in use comes back next time.
      rememberBackground(choice);
      return true;
    } catch {
      setBackground(previous);
      setNotice(t('room.backgroundError'));
      return false;
    } finally {
      setBackgroundBusy(false);
    }
  };
  const addBackground = async (file: File) => {
    setBackgroundBusy(true);
    let picture: OwnPicture;
    try {
      picture = await own.add(file);
    } catch (error) {
      setNotice(
        t(
          error instanceof OwnBackgroundError
            ? `room.ownBackgroundError.${error.problem}`
            : 'room.ownBackgroundError.unreadable',
          { max: MAX_OWN_BACKGROUNDS }
        )
      );
      setBackgroundBusy(false);
      return;
    }
    // A new picture is put to use at once; its URL is not in state yet.
    await pickBackground(ownChoice(picture.id), (id) =>
      id === picture.id ? picture.url : own.urlOf(id)
    );
  };
  const removeBackground = async (id: string) => {
    if (background === ownChoice(id) && !(await pickBackground('none'))) return;
    // Busy throughout, so the picture cannot be picked while its URL goes.
    setBackgroundBusy(true);
    try {
      await own.remove(id);
    } catch {
      setNotice(t('room.ownBackgroundError.remove'));
    } finally {
      setBackgroundBusy(false);
    }
  };
  const floor = async (person: LivePerson, allowed: boolean) => {
    const result = await api.floor(classId, session.id, person.identity, allowed);
    if (!result.ok) setNotice(result.message);
  };
  const toggleRecording = async () => {
    if (!recordingWanted && !window.confirm(t('room.confirmRecording'))) return;
    setRecordingBusy(true);
    const result = recordingWanted
      ? await api.stopRecording(classId, session.id)
      : await api.startRecording(classId, session.id);
    setRecordingBusy(false);
    if (!result.ok) {
      setNotice(result.message);
      return;
    }
    setRecordingWanted(result.value.session.recording);
    if (!result.value.session.recording) setNotice(t('room.recordingSaved'));
  };
  const endForAll = async () => {
    if (!window.confirm(t('room.confirmEnd'))) return;
    const result = await api.end(classId, session.id);
    if (!result.ok) {
      setNotice(result.message);
      return;
    }
    connection.disconnect();
    onLeave();
  };

  if (state.status === 'disconnected') {
    return (
      <div className="stack">
        <p className="card">{state.ended ? t('room.ended') : t('room.left')}</p>
        <Link to={`/classes/${classId}`}>{t('room.back')}</Link>
      </div>
    );
  }

  return (
    <div className="live-room">
      <header className="row live-header">
        <span className="stack" style={{ gap: 0 }}>
          <Link to={`/classes/${classId}`} className="muted">
            {t('room.back')}
          </Link>
          <h1>{session.title}</h1>
          <SessionTags session={session} />
        </span>
        {recording && (
          <p className="live-tag live-recording" role="status">
            {t('room.recordingBadge')}
          </p>
        )}
        {state.status === 'reconnecting' && (
          <p className="live-tag" role="status">
            {t('room.reconnecting')}
          </p>
        )}
      </header>
      <div className="live-main">
        {notice && (
          <p className="card live-notice" role="status">
            {notice}
          </p>
        )}
        <Stage connection={connection} teacher={teacher} />
        {floorTiles.length > 0 && (
          <div className="live-tiles">
            {floorTiles.map((p) => (
              <figure key={p.identity} className="live-tile">
                <Video
                  connection={connection}
                  person={p}
                  source="camera"
                  label={p.name}
                />
                <figcaption>{p.name}</figcaption>
              </figure>
            ))}
          </div>
        )}
      </div>
      <div className="live-controls row" role="toolbar" aria-label={t('room.controls')}>
        {state.canPublish && me && (
          <>
            <button
              className="btn"
              aria-pressed={me.micOn}
              onClick={() => void device(() => connection.setMicrophone(!me.micOn))}
            >
              {me.micOn ? t('room.micOff') : t('room.micOn')}
            </button>
            {(teacherView || session.learnerCameras) && (
              <button
                className="btn"
                aria-pressed={me.cameraOn}
                onClick={() => void device(() => connection.setCamera(!me.cameraOn))}
              >
                {me.cameraOn ? t('room.cameraOff') : t('room.cameraOn')}
              </button>
            )}
          </>
        )}
        {teacherView && me && screenShare && (
          <button
            className="btn"
            aria-pressed={me.screenOn}
            onClick={() => void device(() => connection.setScreenShare(!me.screenOn))}
          >
            {me.screenOn ? t('room.stopShare') : t('room.shareScreen')}
          </button>
        )}
        {teacherView && me && !screenShare && (
          <span className="muted" style={{ fontSize: '0.85rem' }}>
            {t('room.noScreenShare')}
          </span>
        )}
        {!teacherView && me && !state.canPublish && (
          <button
            className="btn"
            aria-pressed={me.hand}
            onClick={() => void connection.raiseHand(!me.hand)}
          >
            {me.hand ? t('room.lowerHand') : `✋ ${t('room.raiseHand')}`}
          </button>
        )}
        <button
          className="btn"
          onClick={() => {
            connection.disconnect();
            onLeave();
          }}
        >
          {t('room.leave')}
        </button>
        {teacherView && recordingEnabled && (
          <button
            className="btn"
            aria-pressed={recordingWanted}
            disabled={recordingBusy}
            onClick={() => void toggleRecording()}
          >
            {recordingWanted ? t('room.stopRecording') : t('room.startRecording')}
          </button>
        )}
        {teacherView && (
          <button className="btn btn-danger" onClick={() => void endForAll()}>
            {t('room.endForAll')}
          </button>
        )}
      </div>
      <div className="live-side">
        {backgrounds && mayUseCamera && (
          <BackgroundPicker
            value={background}
            busy={backgroundBusy || own.pictures === null}
            own={own.pictures ?? []}
            onChange={(choice) => void pickBackground(choice)}
            onAdd={(file) => void addBackground(file)}
            onRemove={(id) => void removeBackground(id)}
          />
        )}
        <People
          people={state.people}
          teacherView={teacherView}
          onFloor={(p, allowed) => void floor(p, allowed)}
        />
        <Chat state={state} connection={connection} />
      </div>
    </div>
  );
}

export function LiveRoom({
  api: givenApi,
  connect = connectLive,
  screenShare = canShareScreen(),
  backgrounds = canUseBackgrounds(),
  ownBackgrounds: givenOwnBackgrounds,
}: {
  api?: LiveApi;
  connect?: ConnectLive;
  /** The browser can share the screen (not on iPhone and iPad). */
  screenShare?: boolean;
  /** The browser can put a background behind the camera. */
  backgrounds?: boolean;
  /** Where the person's own background pictures are kept (this device by default). */
  ownBackgrounds?: OwnBackgroundStore;
}) {
  const { t } = useTranslation('live');
  const { id: classId = '', session: sessionId = '' } = useParams();
  const api = useMemo(() => givenApi ?? new LiveApi(), [givenApi]);
  const ownBackgrounds = useMemo(
    () => givenOwnBackgrounds ?? deviceBackgrounds(),
    [givenOwnBackgrounds]
  );
  const audioHost = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState<Phase>({ kind: 'ready' });
  // The class page tells the room when the teacher comes in (only for the hint below).
  const teacherHint = Boolean(
    (useLocation().state as { teacher?: boolean } | null)?.teacher
  );
  // Before joining, everyone learns whether the lesson may be recorded (and whether it is).
  const [recordingInfo, setRecordingInfo] = useState<{
    enabled: boolean;
    now: boolean;
  } | null>(null);
  useEffect(() => {
    let active = true;
    void api.list(classId).then((result) => {
      if (!active || !result.ok) return;
      const session = result.value.sessions.find((s) => s.id === sessionId);
      setRecordingInfo({
        enabled: result.value.recordingEnabled,
        now: Boolean(session?.recording),
      });
    });
    return () => {
      active = false;
    };
  }, [api, classId, sessionId]);

  // Leaving the page leaves the room, also when it is left while still connecting.
  const connection = phase.kind === 'room' ? phase.connection : null;
  useEffect(() => () => connection?.disconnect(), [connection]);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const join = async () => {
    setPhase({ kind: 'joining' });
    const result = await api.join(classId, sessionId);
    if (!result.ok) {
      setPhase({ kind: 'error', message: result.message });
      return;
    }
    try {
      const connection = await connect(
        result.value.url,
        result.value.token,
        audioHost.current!
      );
      if (!mounted.current) {
        connection.disconnect();
        return;
      }
      setPhase({
        kind: 'room',
        role: result.value.role,
        session: result.value.session,
        connection,
      });
    } catch (error) {
      setPhase({ kind: 'error', message: String((error as Error).message ?? error) });
    }
  };

  return (
    <div className="stack live-page">
      <div ref={audioHost} hidden />
      {phase.kind === 'room' ? (
        <Room
          api={api}
          classId={classId}
          session={phase.session}
          role={phase.role}
          connection={phase.connection}
          screenShare={screenShare}
          backgrounds={backgrounds}
          ownBackgrounds={ownBackgrounds}
          recordingEnabled={Boolean(recordingInfo?.enabled)}
          onLeave={() => setPhase({ kind: 'left' })}
        />
      ) : (
        <div className="card stack live-prejoin">
          <Link to={`/classes/${classId}`} className="muted">
            {t('room.back')}
          </Link>
          <h1>{t('title')}</h1>
          <p>{teacherHint ? t('room.preJoinTeacher') : t('room.preJoinLearner')}</p>
          {recordingInfo?.enabled && (
            <p className="live-recording-notice">
              {t('room.recordingNotice')}
              {recordingInfo.now && <strong> {t('room.recordingNow')}</strong>}
            </p>
          )}
          {phase.kind === 'error' && (
            <p className="feedback-warn" role="alert">
              {phase.message}
            </p>
          )}
          {phase.kind === 'left' && <p className="muted">{t('room.left')}</p>}
          <button
            className="btn btn-primary"
            disabled={phase.kind === 'joining'}
            onClick={() => void join()}
          >
            {phase.kind === 'joining'
              ? t('room.joining')
              : phase.kind === 'left'
                ? t('room.rejoin')
                : t('room.join')}
          </button>
        </div>
      )}
    </div>
  );
}
