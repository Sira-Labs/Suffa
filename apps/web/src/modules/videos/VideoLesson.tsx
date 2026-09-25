/**
 * One video lesson (stories 12.2, 12.3, 12.5): the YouTube embed (privacy-enhanced host,
 * inline on phones) driven through the IFrame API. Checkpoints pause the video and resume it
 * after the answer; the transcript follows along with tap-to-gloss. Both appear only where the
 * creator allowed it. Watching to the end counts like a heard track (daily quests, XP).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { CheckpointDialog } from '@/modules/classes/player/CheckpointDialog';
import {
  CheckpointEditor,
  TranscriptEditor,
} from '@/modules/classes/player/RecordingEditors';
import {
  attachPlayer,
  loadYouTubeApi,
  type YouTubeNamespace,
  type YouTubePlayer,
} from '@/services/discover/youtubeApi';
import type { InteractiveApi } from '@/services/media/interactiveApi';
import { dueCheckpoint, type Checkpoint, type Cue } from '@/services/media/checkpoints';
import { ApiSyncProvider } from '@/services/sync/ApiSyncProvider';
import { VideosApi, type VideoLesson as Lesson } from '@/services/videos/videosApi';
import {
  useCelebrationStore,
  useListenStore,
  usePracticeStore,
  useSyncStore,
} from '@/state';
import { GlossTranscript } from './GlossTranscript';

/** Position poll; checkpoints trigger within ±0.5 s (TRIGGER_WINDOW_SEC guards seeks). */
const POLL_MS = 250;
/** Watched seconds are saved at least this often. */
const FLUSH_MS = 15_000;

export function VideoLesson({
  api: injected,
  loadApi = loadYouTubeApi,
}: {
  api?: VideosApi;
  loadApi?: () => Promise<YouTubeNamespace>;
}) {
  const { id = '' } = useParams();
  const api = useMemo(() => injected ?? new VideosApi(), [injected]);
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [checkpoints, setCheckpoints] = useState<Checkpoint[]>([]);
  const [cues, setCues] = useState<Cue[]>([]);
  const [missing, setMissing] = useState(false);
  const [time, setTime] = useState(0);
  const [open, setOpen] = useState<Checkpoint | null>(null);
  const [done, setDone] = useState<ReadonlySet<string>>(new Set());
  const frame = useRef<HTMLIFrameElement>(null);
  const player = useRef<YouTubePlayer | null>(null);
  const last = useRef(0);
  const played = useRef(0);
  // The poll reads the answered checkpoints without restarting on every answer.
  const doneRef = useRef(done);
  doneRef.current = done;
  const record = useListenStore((s) => s.record);
  const heard = useListenStore((s) => s.progress[`yt/${id}`]);
  const practise = usePracticeStore((s) => s.practise);
  const celebrate = useCelebrationStore((s) => s.show);
  const provider = useSyncStore((s) => s.provider);
  const admin =
    provider instanceof ApiSyncProvider && provider.currentUser()?.role === 'admin';

  const load = useCallback(async () => {
    const result = await api.get(id);
    if (!result.ok) return setMissing(true);
    setLesson(result.value.video);
    setCheckpoints(result.value.checkpoints);
    setCues(result.value.transcript);
  }, [api, id]);

  useEffect(() => {
    void load();
  }, [load]);

  const flush = useCallback(async () => {
    const seconds = played.current;
    const p = player.current;
    if (!lesson || seconds <= 0 || !p) return;
    played.current = 0;
    const outcome = await record(
      {
        id: `yt/${lesson.id}`,
        url: `youtube:${lesson.youtubeId}`,
        lessonKey: 'yt',
        lessonSize: Number.MAX_SAFE_INTEGER,
        source: 'video-lesson',
      },
      seconds,
      p.getDuration() || lesson.durationSec || 0
    );
    if (outcome.trackHeard) {
      celebrate({
        title: `Videolektion angesehen: ${lesson.title}`,
        xp: outcome.xp,
        big: false,
      });
    }
  }, [lesson, record, celebrate]);

  // Attach the IFrame API once the embed is there; poll the position for checkpoints.
  useEffect(() => {
    if (!lesson || !frame.current) return;
    let cancelled = false;
    let poll: ReturnType<typeof setInterval> | undefined;
    const flushTimer = setInterval(() => void flush(), FLUSH_MS);
    void loadApi()
      .then((YT) => {
        if (cancelled || !frame.current) return;
        player.current = attachPlayer(YT, frame.current, (state) => {
          if (state === YT.PlayerState.ENDED || state === YT.PlayerState.PAUSED)
            void flush();
        });
        poll = setInterval(() => {
          const p = player.current;
          if (!p) return;
          const now = p.getCurrentTime();
          const previous = last.current;
          last.current = now;
          setTime(now);
          // Only real playback counts as watched (not a jump ahead).
          if (now > previous && now - previous <= 1.5) played.current += now - previous;
          setOpen((current) => {
            if (current) return current;
            const due = dueCheckpoint(checkpoints, previous, now, doneRef.current);
            if (due) p.pauseVideo?.();
            return due;
          });
        }, POLL_MS);
      })
      .catch(() => undefined); // Without the API the embed still plays; no checkpoints.
    return () => {
      cancelled = true;
      if (poll) clearInterval(poll);
      clearInterval(flushTimer);
      void flush();
      player.current?.destroy();
      player.current = null;
    };
  }, [lesson, checkpoints, loadApi, flush]);

  const answered = async (cp: Checkpoint, correct: boolean) => {
    setDone((d) => new Set(d).add(cp.id));
    setOpen(null);
    if (correct && lesson) {
      const outcome = await practise(0, 'checkpoint', `yt/${lesson.id}/${cp.id}`, []);
      if (outcome.first)
        celebrate({ title: 'Checkpoint geschafft', xp: outcome.xp, big: false });
    }
    player.current?.playVideo?.();
  };

  const seek = (seconds: number) => {
    last.current = seconds;
    player.current?.seekTo?.(seconds, true);
  };

  if (missing) {
    return (
      <div className="stack">
        <Link to="/videos" className="muted">
          ← Videolektionen
        </Link>
        <p className="muted">Diese Videolektion gibt es nicht (mehr).</p>
      </div>
    );
  }
  if (!lesson) return <p className="muted">Lade …</p>;

  // The editors of recordings, pointed at the video endpoints (admins only).
  const editorApi = {
    addCheckpoint: (_c: string, _m: string, atSec: number, data: Checkpoint['data']) =>
      api.addCheckpoint(lesson.id, atSec, data),
    removeCheckpoint: (_c: string, _m: string, cpId: string) =>
      api.removeCheckpoint(lesson.id, cpId),
    saveTranscript: (_c: string, _m: string, next: Cue[]) =>
      api.saveTranscript(lesson.id, next),
    generateTranscript: async () => ({
      ok: false as const,
      status: 0,
      code: 'x',
      message: '',
    }),
  } as unknown as InteractiveApi;

  return (
    <div className="stack" style={{ gap: '1rem' }}>
      <Link
        to={lesson.unit ? `/videos?unit=${lesson.unit}` : '/videos'}
        className="muted"
      >
        ← Videolektionen
      </Link>
      <h1 dir="auto">{lesson.title}</h1>
      <span className="muted">
        {lesson.channel.name}
        {lesson.unit ? ` · Einheit ${lesson.unit}` : ''}
        {heard?.completedAt ? ' · ✓ angesehen' : ''}
      </span>
      <div className="video-frame">
        <iframe
          ref={frame}
          title={lesson.title}
          src={`https://www.youtube-nocookie.com/embed/${lesson.youtubeId}?enablejsapi=1&playsinline=1&rel=0&origin=${encodeURIComponent(window.location.origin)}`}
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
          allowFullScreen
        />
      </div>
      {open && (
        <CheckpointDialog checkpoint={open} onDone={(ok) => void answered(open, ok)} />
      )}
      {checkpoints.length > 0 && (
        <span className="muted" style={{ fontSize: '0.9rem' }}>
          {checkpoints.length} Fragen im Video · {done.size} beantwortet
        </span>
      )}
      {!lesson.interactive && (
        <p className="muted" style={{ margin: 0 }}>
          Fragen und Transkript folgen, sobald die Autoren zugestimmt haben.
        </p>
      )}
      <GlossTranscript cues={cues} time={time} onSeek={seek} />
      {admin && (
        <>
          <CheckpointEditor
            api={editorApi}
            classId=""
            mediaId={lesson.id}
            checkpoints={checkpoints}
            currentTime={() => player.current?.getCurrentTime() ?? 0}
            onChange={() => void load()}
          />
          <TranscriptEditor
            key={cues.length}
            api={editorApi}
            classId=""
            mediaId={lesson.id}
            transcript={{
              status: 'ready',
              source: 'manual',
              cues,
              error: null,
              updatedAt: '',
            }}
            canGenerate={false}
            currentTime={() => player.current?.getCurrentTime() ?? 0}
            onChange={() => void load()}
          />
          {!lesson.interactive && (
            <p className="muted" style={{ margin: 0 }}>
              Admin: Fragen und Transkript sehen Lernende erst, wenn die Erlaubnis des
              Kanals auf „Erlaubt“ steht (Verwaltung → Videos).
            </p>
          )}
        </>
      )}
    </div>
  );
}
