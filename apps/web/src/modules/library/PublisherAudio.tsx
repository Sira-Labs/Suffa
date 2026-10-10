import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import type {
  AudioLesson,
  AudioTrack,
  AudioTrackKind,
  AudioUnit,
  MediaProgress,
  PublisherAudioIndex,
} from '@/types';
import { Icon } from '@/components/Icon';
import i18n from '@/i18n';
import { logger } from '@/services/logger';
import { lessonKey, loadPublisherIndex, trackId } from '@/services/audio/publisherIndex';
import { useCelebrationStore, useListenStore, type TrackRef } from '@/state';

const log = logger.child('library:audio');

/** Learner-facing label for a track kind, in the interface language. */
export function kindLabel(kind: AudioTrackKind): string {
  return i18n.t(`library:audio.kinds.${kind}`);
}

type Filter = 'all' | 'open' | 'dialogue' | 'vocabulary' | 'listening' | 'practice';

/** Labels come from the catalogue: `library:audio.filters.<id>`. */
const FILTERS: { id: Filter; kinds: AudioTrackKind[] | null }[] = [
  { id: 'all', kinds: null },
  { id: 'open', kinds: null },
  { id: 'dialogue', kinds: ['dialogue'] },
  { id: 'vocabulary', kinds: ['vocabulary'] },
  { id: 'listening', kinds: ['listening'] },
  { id: 'practice', kinds: ['exercise-example', 'exercise', 'sounds', 'exam'] },
];

/** Played seconds are saved at least this often while a track runs. */
const FLUSH_EVERY_SEC = 5;
/** A larger jump between two time updates is a seek, not listening. */
const MAX_NATURAL_STEP_SEC = 1.5;

function unitLabel(unit: AudioUnit): string {
  if (unit.kind === 'unit') return i18n.t('library:unit', { unit: unit.unit });
  return i18n.t(
    /النهائي/.test(unit.title) ? 'library:audio.finalTest' : 'library:audio.midTest'
  );
}

function isHeard(progress: Record<string, MediaProgress>, id: string): boolean {
  return Boolean(progress[id]?.completedAt);
}

/**
 * The publisher's official audio for Book 1, by unit and lesson, with listening progress:
 * a track counts as heard after 85 % of it was actually played; heard tracks and lessons give
 * XP (engagement rules) and a short celebration. Audio streams from the publisher's server.
 */
export function PublisherAudio({
  initialUnit = 1,
  unit: controlledUnit,
  focusLesson,
  onlyLesson,
  onUnitChange,
  hideUnitPicker = false,
}: {
  initialUnit?: number;
  /** Selected unit when the page owns the choice (shared with the videos). */
  unit?: number;
  /** Lesson to scroll to and highlight (from a unit's learning path). */
  focusLesson?: number;
  /** Show only this lesson (a unit section focuses on one dialogue). */
  onlyLesson?: number;
  /** Called when the learner picks another unit (the page shows that unit's videos too). */
  onUnitChange?: (unit: number) => void;
  /** Inside a unit: no book progress bar and no unit chips, only this unit's lessons. */
  hideUnitPicker?: boolean;
}) {
  const { t } = useTranslation('library');
  const [index, setIndex] = useState<PublisherAudioIndex | null>(null);
  const [failed, setFailed] = useState(false);
  const [ownUnit, setOwnUnit] = useState(initialUnit);
  const unitNo = controlledUnit ?? ownUnit;
  const chooseUnit = (unit: number) => {
    setOwnUnit(unit);
    onUnitChange?.(unit);
  };
  const [filter, setFilter] = useState<Filter>('all');
  const progress = useListenStore((s) => s.progress);

  useEffect(() => {
    let cancelled = false;
    loadPublisherIndex()
      .then((loaded) => {
        if (!cancelled) setIndex(loaded);
      })
      .catch((error: unknown) => {
        log.error('Publisher audio index could not be loaded', {
          message: error instanceof Error ? error.message : String(error),
        });
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!index || focusLesson === undefined) return;
    document
      .getElementById(`lesson-${focusLesson}`)
      ?.scrollIntoView?.({ block: 'start', behavior: 'smooth' });
  }, [index, focusLesson]);

  const stats = useMemo(() => {
    if (!index) return null;
    const perUnit = new Map<number, { heard: number; total: number }>();
    let heard = 0;
    let total = 0;
    for (const u of index.units) {
      const ids = u.lessons.flatMap((l) =>
        l.tracks.map((t) => trackId(index.book, t.url))
      );
      const unitHeard = ids.filter((id) => isHeard(progress, id)).length;
      perUnit.set(u.unit, { heard: unitHeard, total: ids.length });
      heard += unitHeard;
      total += ids.length;
    }
    return { perUnit, heard, total };
  }, [index, progress]);

  const unit = useMemo(
    () => index?.units.find((u) => u.unit === unitNo) ?? index?.units[0],
    [index, unitNo]
  );
  const active = FILTERS.find((f) => f.id === filter)!;

  if (failed) return <p className="muted">{t('audio.failed')}</p>;
  if (!index || !unit || !stats) return <p className="muted">{t('audio.loading')}</p>;

  const visible = (track: AudioTrack) =>
    filter === 'open'
      ? !isHeard(progress, trackId(index.book, track.url))
      : !active.kinds || active.kinds.includes(track.kind);
  const focused = unit.lessons.filter((l) => l.lesson === onlyLesson);
  const lessons = focused.length > 0 ? focused : unit.lessons;

  return (
    <div className="stack">
      {!hideUnitPicker && (
        <>
          <div className="stack" style={{ gap: '0.4rem' }}>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <span style={{ fontWeight: 600 }}>
                {t('audio.heardOfTotal', { heard: stats.heard, total: stats.total })}
              </span>
              <span className="muted">
                {t('audio.percent', {
                  percent: Math.round((stats.heard / Math.max(1, stats.total)) * 100),
                })}
              </span>
            </div>
            <ProgressBar
              value={stats.heard}
              max={stats.total}
              label={t('audio.bookProgress')}
            />
          </div>

          <div className="row" role="group" aria-label={t('audio.chooseUnit')}>
            {index.units.map((u) => {
              const s = stats.perUnit.get(u.unit)!;
              const done = s.total > 0 && s.heard === s.total;
              return (
                <button
                  key={u.unit}
                  className={`btn unit-chip${u.unit === unit.unit ? ' btn-accent' : ''}${done ? ' unit-chip-done' : ''}`}
                  aria-pressed={u.unit === unit.unit}
                  aria-label={t('audio.unitChip', {
                    unit: unitLabel(u),
                    heard: s.heard,
                    total: s.total,
                  })}
                  style={
                    {
                      '--p': `${(s.heard / Math.max(1, s.total)) * 100}%`,
                    } as CSSProperties
                  }
                  onClick={() => chooseUnit(u.unit)}
                >
                  {done && <Icon name="check" size={14} strokeWidth={2.6} />}
                  {u.kind === 'unit' ? u.unit : unitLabel(u)}
                </button>
              );
            })}
          </div>
        </>
      )}
      <div className="row" role="group" aria-label={t('audio.kindGroup')}>
        {FILTERS.map((f) => (
          <button
            key={f.id}
            className={`btn ${f.id === filter ? 'btn-accent' : ''}`}
            aria-pressed={f.id === filter}
            onClick={() => setFilter(f.id)}
          >
            {t(`audio.filters.${f.id}`)}
          </button>
        ))}
      </div>

      {!hideUnitPicker && <h2 style={{ margin: 0 }}>{unitLabel(unit)}</h2>}
      {lessons.map((lesson) => (
        <LessonBlock
          key={lesson.lesson}
          book={index.book}
          unit={unit}
          lesson={lesson}
          visible={visible}
          progress={progress}
          focused={lesson.lesson === focusLesson}
        />
      ))}
      {filter === 'open' && lessons.every((l) => l.tracks.every((t) => !visible(t))) && (
        <p className="feedback-good" style={{ margin: 0, fontWeight: 600 }}>
          {focused.length > 0 ? t('audio.allHeardLesson') : t('audio.allHeardUnit')}
        </p>
      )}
      <p className="muted" style={{ fontSize: '0.85em' }}>
        {t('audio.credit', { publisher: index.source.publisher })}
      </p>
    </div>
  );
}

function ProgressBar({
  value,
  max,
  label,
}: {
  value: number;
  max: number;
  label: string;
}) {
  return (
    <div
      className="review-progress"
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
    >
      <div style={{ width: `${(value / Math.max(1, max)) * 100}%` }} />
    </div>
  );
}

function LessonBlock({
  book,
  unit,
  lesson,
  visible,
  progress,
  focused,
}: {
  book: number;
  unit: AudioUnit;
  lesson: AudioLesson;
  visible: (track: AudioTrack) => boolean;
  progress: Record<string, MediaProgress>;
  focused: boolean;
}) {
  const { t } = useTranslation('library');
  const tracks = lesson.tracks.filter(visible);
  if (tracks.length === 0) return null;
  const key = lessonKey(book, unit, lesson);
  const heard = lesson.tracks.filter((t) =>
    isHeard(progress, trackId(book, t.url))
  ).length;
  const complete = heard === lesson.tracks.length;
  return (
    <section
      id={`lesson-${lesson.lesson}`}
      className={`lesson-block stack${focused ? ' lesson-block-focus' : ''}`}
      aria-label={lesson.title}
    >
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <strong lang="ar" dir="rtl">
          {lesson.title}
        </strong>
        <span className={`badge${complete ? ' badge-done' : ''}`}>
          {complete && <Icon name="check" size={14} strokeWidth={2.6} />}
          {t('audio.lessonHeard', { heard, total: lesson.tracks.length })}
        </span>
      </div>
      {tracks.map((track) => (
        <TrackRow
          key={track.url}
          track={track}
          trackRef={{
            id: trackId(book, track.url),
            url: track.url,
            lessonKey: key,
            lessonSize: lesson.tracks.length,
          }}
          progress={progress[trackId(book, track.url)]}
        />
      ))}
    </section>
  );
}

function TrackRow({
  track,
  trackRef,
  progress,
}: {
  track: AudioTrack;
  trackRef: TrackRef;
  progress: MediaProgress | undefined;
}) {
  const { t } = useTranslation('library');
  const record = useListenStore((s) => s.record);
  const celebrate = useCelebrationStore((s) => s.show);
  const lastTime = useRef<number | null>(null);
  const pending = useRef(0);

  const flush = async (audio: HTMLAudioElement) => {
    const played = pending.current;
    pending.current = 0;
    if (played <= 0) return;
    const outcome = await record(trackRef, played, audio.duration);
    if (outcome.trackHeard) {
      celebrate({
        title: outcome.lessonComplete
          ? t('audio.celebrateLesson')
          : t('audio.celebrateTrack', { kind: kindLabel(track.kind) }),
        xp: outcome.xp,
        big: outcome.lessonComplete,
      });
    }
  };

  const heard = Boolean(progress?.completedAt);
  const percent = progress
    ? Math.round((progress.listenedSec / Math.max(1, progress.durationSec)) * 100)
    : 0;

  return (
    <div
      className={`track-row stack${heard ? ' track-row-heard' : ''}`}
      style={{ gap: 4 }}
    >
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <span lang="ar" dir="rtl">
          {track.title}
        </span>
        <span className="row" style={{ gap: '0.4rem' }}>
          {heard ? (
            <span className="badge badge-done">
              <Icon name="check" size={14} strokeWidth={2.6} />
              {t('audio.heard')}
            </span>
          ) : percent > 0 ? (
            <span className="badge">{t('audio.percent', { percent })}</span>
          ) : null}
          <span className="badge">{kindLabel(track.kind)}</span>
        </span>
      </div>
      <audio
        controls
        preload="none"
        src={track.url}
        style={{ width: '100%' }}
        aria-label={t('audio.trackLabel', {
          kind: kindLabel(track.kind),
          title: track.title,
        })}
        onPlay={(e) => {
          lastTime.current = e.currentTarget.currentTime;
        }}
        onSeeked={(e) => {
          lastTime.current = e.currentTarget.currentTime;
        }}
        onTimeUpdate={(e) => {
          const audio = e.currentTarget;
          const now = audio.currentTime;
          if (lastTime.current !== null && !audio.seeking) {
            const step = now - lastTime.current;
            if (step > 0 && step < MAX_NATURAL_STEP_SEC) pending.current += step;
          }
          lastTime.current = now;
          if (pending.current >= FLUSH_EVERY_SEC) void flush(audio);
        }}
        onPause={(e) => void flush(e.currentTarget)}
        onEnded={(e) => void flush(e.currentTarget)}
      />
    </div>
  );
}
