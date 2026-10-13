/**
 * The live room (ADR-0026): the teacher large on the stage (screen share before camera),
 * learners who have the floor as small tiles, the people with raised hands, the chat and the
 * controls. The teacher gives and takes the floor; learners raise their hand.
 *
 * Joining starts from a click so the browser lets the room's sound play.
 */
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useParams } from 'react-router-dom';
import { LiveApi, type LiveRole, type LiveSession } from '@/services/live/liveApi';
import {
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
  return (
    <div className={`live-stage${teacher.speaking ? ' live-speaking' : ''}`}>
      {source ? (
        <Video
          connection={connection}
          person={teacher}
          source={source}
          label={teacher.name}
        />
      ) : (
        <p className="live-stage-empty">
          <strong>{teacher.name}</strong>
          <span>{t('room.teacherCameraOff')}</span>
        </p>
      )}
    </div>
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
  onLeave,
}: {
  api: LiveApi;
  classId: string;
  session: LiveSession;
  role: LiveRole;
  connection: LiveConnection;
  onLeave: () => void;
}) {
  const { t } = useTranslation('live');
  const state = useConnectionState(connection);
  const [notice, setNotice] = useState<string | null>(null);
  const me = state.people.find((p) => p.local);
  const teacher = state.people.find((p) => p.role === 'teacher');
  const teacherView = role === 'teacher';
  const floorTiles = state.people.filter((p) => p.role === 'learner' && p.cameraOn);

  const hadFloor = useRef(false);
  useEffect(() => {
    if (!teacherView && state.canPublish && !hadFloor.current) {
      setNotice(t('room.floorGiven'));
    }
    hadFloor.current = state.canPublish;
  }, [state.canPublish, teacherView, t]);

  const device = async (action: () => Promise<void>) => {
    try {
      await action();
    } catch {
      setNotice(t('room.deviceError'));
    }
  };
  const floor = async (person: LivePerson, allowed: boolean) => {
    const result = await api.floor(classId, session.id, person.identity, allowed);
    if (!result.ok) setNotice(result.message);
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
        </span>
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
            <button
              className="btn"
              aria-pressed={me.cameraOn}
              onClick={() => void device(() => connection.setCamera(!me.cameraOn))}
            >
              {me.cameraOn ? t('room.cameraOff') : t('room.cameraOn')}
            </button>
          </>
        )}
        {teacherView && me && (
          <button
            className="btn"
            aria-pressed={me.screenOn}
            onClick={() => void device(() => connection.setScreenShare(!me.screenOn))}
          >
            {me.screenOn ? t('room.stopShare') : t('room.shareScreen')}
          </button>
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
        {teacherView && (
          <button className="btn btn-danger" onClick={() => void endForAll()}>
            {t('room.endForAll')}
          </button>
        )}
      </div>
      <div className="live-side">
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
}: {
  api?: LiveApi;
  connect?: ConnectLive;
}) {
  const { t } = useTranslation('live');
  const { id: classId = '', session: sessionId = '' } = useParams();
  const api = useMemo(() => givenApi ?? new LiveApi(), [givenApi]);
  const audioHost = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState<Phase>({ kind: 'ready' });
  // The class page tells the room when the teacher comes in (only for the hint below).
  const teacherHint = Boolean(
    (useLocation().state as { teacher?: boolean } | null)?.teacher
  );

  // Leaving the page leaves the room.
  const connection = phase.kind === 'room' ? phase.connection : null;
  useEffect(() => () => connection?.disconnect(), [connection]);

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
          onLeave={() => setPhase({ kind: 'left' })}
        />
      ) : (
        <div className="card stack live-prejoin">
          <Link to={`/classes/${classId}`} className="muted">
            {t('room.back')}
          </Link>
          <h1>{t('title')}</h1>
          <p>{teacherHint ? t('room.preJoinTeacher') : t('room.preJoinLearner')}</p>
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
