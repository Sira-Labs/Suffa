/**
 * Player for a class recording (story 7.5): video or audio from object storage via a
 * presigned same-origin URL. Played time (not seeking) counts; at 85 % the recording is
 * heard, which earns XP and syncs across devices like the book audio.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { MediaApi, type Playback } from '@/services/media/mediaApi';
import { useCelebrationStore, useListenStore } from '@/state';
import { formatDuration } from './ClassRecordings';

/** Save played time at least this often. */
const FLUSH_EVERY_SEC = 10;
/** A timeupdate step larger than this is a seek, not playing. */
const MAX_NATURAL_STEP_SEC = 2;

export function RecordingPlayer() {
  const { id = '', mediaId = '' } = useParams();
  const api = useMemo(() => new MediaApi(), []);
  const [media, setMedia] = useState<Playback | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const record = useListenStore((s) => s.record);
  const heard = useListenStore((s) => s.progress[`rec/${mediaId}`]);
  const celebrate = useCelebrationStore((s) => s.show);
  const lastTime = useRef<number | null>(null);
  const pending = useRef(0);

  useEffect(() => {
    void api.play(id, mediaId).then((result) => {
      if (result.ok) setMedia(result.value);
      else setMessage(result.message);
    });
  }, [api, id, mediaId]);

  if (message) return <p className="feedback-bad">{message}</p>;
  if (!media) return <p className="muted">Lade Aufnahme …</p>;

  const flush = async (el: HTMLMediaElement) => {
    const played = pending.current;
    pending.current = 0;
    if (played <= 0) return;
    const outcome = await record(
      {
        id: `rec/${media.id}`,
        url: `recording:${media.id}`,
        lessonKey: `rec/${id}`,
        lessonSize: Number.MAX_SAFE_INTEGER,
        source: 'recording',
      },
      played,
      el.duration || media.durationSec || 0
    );
    if (outcome.trackHeard) {
      celebrate({ title: `Aufnahme gehört: ${media.title}`, xp: outcome.xp, big: false });
    }
  };
  const handlers = {
    onPlay: (e: React.SyntheticEvent<HTMLMediaElement>) => {
      lastTime.current = e.currentTarget.currentTime;
    },
    onSeeked: (e: React.SyntheticEvent<HTMLMediaElement>) => {
      lastTime.current = e.currentTarget.currentTime;
    },
    onTimeUpdate: (e: React.SyntheticEvent<HTMLMediaElement>) => {
      const el = e.currentTarget;
      const now = el.currentTime;
      if (lastTime.current !== null && !el.seeking) {
        const step = now - lastTime.current;
        if (step > 0 && step < MAX_NATURAL_STEP_SEC) pending.current += step;
      }
      lastTime.current = now;
      if (pending.current >= FLUSH_EVERY_SEC) void flush(el);
    },
    onPause: (e: React.SyntheticEvent<HTMLMediaElement>) => void flush(e.currentTarget),
    onEnded: (e: React.SyntheticEvent<HTMLMediaElement>) => void flush(e.currentTarget),
  };
  const percent = heard
    ? Math.round((heard.listenedSec / Math.max(1, heard.durationSec)) * 100)
    : 0;

  return (
    <div className="stack" style={{ gap: '1rem' }}>
      <Link to={`/classes/${id}`} className="muted">
        ← Zur Klasse
      </Link>
      <h1>{media.title}</h1>
      <span className="muted">
        {formatDuration(media.durationSec)}
        {heard?.completedAt ? ' · ✓ gehört' : percent > 0 ? ` · ${percent} % gehört` : ''}
      </span>
      {media.video ? (
        <video
          controls
          playsInline
          preload="metadata"
          src={media.video}
          style={{ width: '100%', borderRadius: 12, background: '#000' }}
          aria-label={media.title}
          {...handlers}
        />
      ) : (
        <audio
          controls
          preload="metadata"
          src={media.audio}
          style={{ width: '100%' }}
          aria-label={media.title}
          {...handlers}
        />
      )}
    </div>
  );
}
