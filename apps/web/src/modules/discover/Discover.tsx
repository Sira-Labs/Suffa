import { useEffect, useMemo, useRef, useState } from 'react';
import type {
  DiscoverCatalog,
  DiscoverCategory,
  DiscoverEntry,
  DiscoverProgress,
} from '@/types';
import { Icon } from '@/components/Icon';
import { logger } from '@/services/logger';
import {
  CATEGORY_LABELS,
  discoverEmbedUrl,
  formatPosition,
  watchedPercent,
  discoverThumbnail,
  entries as allEntries,
  levelIncludes,
  loadDiscover,
  pinnedEntries,
  seenId,
  weeklyPick,
  youtubeUrl,
  type ResumeAt,
} from '@/services/discover';
import {
  attachPlayer,
  loadYouTubeApi,
  type YouTubePlayer,
} from '@/services/discover/youtubeApi';
import { XP_RULES } from '@/services/engagement/xp';
import { useCelebrationStore, useDiscoverStore, useListenStore } from '@/state';

const log = logger.child('discover');

/** The learner's level; Book 1 = level 1 until later books exist. */
const CURRENT_LEVEL = 1;

type Filter = 'mine' | DiscoverCategory;
const FILTERS: { id: Filter; label: string }[] = [
  { id: 'mine', label: 'Für dich' },
  { id: 'sprache', label: CATEGORY_LABELS.sprache },
  { id: 'quran', label: CATEGORY_LABELS.quran },
  { id: 'geschichten', label: CATEGORY_LABELS.geschichten },
  { id: 'podcasts', label: CATEGORY_LABELS.podcasts },
];

/**
 * "Entdecken": a curated library of YouTube videos and podcasts about the Arabic language and
 * the Quran, beyond the book. Items play inline (no-cookie player, only after a tap) and can
 * be marked as seen for XP. Everything plays in one "Jetzt läuft" player on top, so cards can
 * move freely: started items are pinned to "Weiterschauen" at once (last opened first) until
 * they are seen or unpinned, and any item can be pinned by hand.
 */
export function Discover() {
  const [catalog, setCatalog] = useState<DiscoverCatalog | null>(null);
  const [failed, setFailed] = useState(false);
  const [filter, setFilter] = useState<Filter>('mine');
  const [playing, setPlaying] = useState<DiscoverEntry | null>(null);
  const playerRef = useRef<HTMLElement>(null);
  const open = useDiscoverStore((s) => s.open);
  const progress = useDiscoverStore((s) => s.progress);
  const listened = useListenStore((s) => s.progress);

  useEffect(() => {
    let cancelled = false;
    loadDiscover()
      .then((c) => !cancelled && setCatalog(c))
      .catch((error: unknown) => {
        log.error('Discover catalog could not be loaded', {
          message: error instanceof Error ? error.message : String(error),
        });
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const list = useMemo(() => (catalog ? allEntries(catalog) : []), [catalog]);
  const forLevel = useMemo(
    () => list.filter((e) => levelIncludes(e.channel.level, CURRENT_LEVEL)),
    [list]
  );
  // Every item shows exactly once: pinned ones on top, the rest in the list.
  const pinned = pinnedEntries(list, progress, (e) =>
    Boolean(listened[seenId(e)]?.completedAt)
  );
  const pinnedIds = new Set(pinned.map((e) => e.id));
  const visible = (
    filter === 'mine' ? forLevel : list.filter((e) => e.channel.category === filter)
  ).filter((e) => !pinnedIds.has(e.id));
  const pick = weeklyPick(forLevel);
  const play = (entry: DiscoverEntry) => {
    setPlaying(entry);
    void open(seenId(entry));
  };

  useEffect(() => {
    // jsdom has no scrollIntoView; in the app the player comes into view on play.
    if (playing)
      playerRef.current?.scrollIntoView?.({ block: 'start', behavior: 'smooth' });
  }, [playing]);

  if (failed) return <p className="muted">Die Mediathek konnte nicht geladen werden.</p>;
  if (!catalog) return <p className="muted">Lade Mediathek …</p>;

  return (
    <div className="stack" style={{ gap: '1.25rem' }}>
      <header className="stack" style={{ gap: '0.25rem' }}>
        <h1 style={{ margin: 0 }}>Entdecken</h1>
        <p className="muted" style={{ margin: 0 }}>
          Ausgewählte Videos und Podcasts zur arabischen Sprache und zum Quran · passend
          zu Stufe {CURRENT_LEVEL}
        </p>
      </header>

      {playing && (
        <section
          ref={playerRef}
          className="card stack discover-now"
          aria-label="Jetzt läuft"
        >
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <span className="eyebrow" style={{ color: 'var(--accent)' }}>
              Jetzt läuft
            </span>
            <button
              type="button"
              className="icon-button"
              onClick={() => setPlaying(null)}
              aria-label="Player schließen"
            >
              <Icon name="close" size={18} />
            </button>
          </div>
          <ResumablePlayer key={playing.id} entry={playing} />
          <strong>{playing.title}</strong>
          <span className="muted" style={{ fontSize: '0.9rem' }}>
            {playing.channel.title}
          </span>
          <ItemActions entry={playing} />
        </section>
      )}

      {pinned.length > 0 && (
        <section
          className="stack"
          aria-labelledby="pinned-title"
          style={{ gap: '0.75rem' }}
        >
          <h2 id="pinned-title" className="eyebrow" style={{ margin: 0 }}>
            Weiterschauen
          </h2>
          <ul className="discover-list" aria-label="Weiterschauen">
            {pinned.map((entry) => (
              <DiscoverCard
                key={`${entry.channel.handle}-${entry.id}`}
                entry={entry}
                playing={playing?.id === entry.id}
                onPlay={() => play(entry)}
              />
            ))}
          </ul>
        </section>
      )}

      <div className="row discover-filters" role="group" aria-label="Kategorie">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            className={`btn${f.id === filter ? ' btn-accent' : ''}`}
            aria-pressed={f.id === filter}
            onClick={() => setFilter(f.id)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {filter === 'mine' && pick && (
        <section className="card stack discover-pick" aria-labelledby="pick-title">
          <span className="eyebrow" style={{ color: 'var(--accent-2)' }}>
            Empfehlung der Woche
          </span>
          <h2 id="pick-title" style={{ margin: 0 }}>
            {pick.title}
          </h2>
          <span className="muted">
            {pick.channel.title}
            {pick.minutes ? ` · ${pick.minutes} Min.` : ''}
          </span>
          <p style={{ margin: 0 }}>{pick.why}</p>
        </section>
      )}

      {visible.length === 0 ? (
        <p className="muted">
          {list.length === 0
            ? 'Die Auswahl wird gerade zusammengestellt – schau bald wieder vorbei.'
            : pinned.length > 0
              ? 'Alles Weitere aus dieser Auswahl steht oben unter „Weiterschauen“.'
              : 'In dieser Kategorie gibt es noch keine Empfehlungen.'}
        </p>
      ) : (
        <ul className="discover-list" aria-label="Empfehlungen">
          {visible.map((entry) => (
            <DiscoverCard
              key={`${entry.channel.handle}-${entry.id}`}
              entry={entry}
              playing={playing?.id === entry.id}
              onPlay={() => play(entry)}
            />
          ))}
        </ul>
      )}

      <p className="muted" style={{ fontSize: '0.85em', margin: 0 }}>
        Alle Videos gehören ihren Kanälen und werden von YouTube abgespielt (ohne Cookies
        bis zum Start). Die Auswahl wird regelmäßig geprüft; Vorschläge gern an deinen
        Lehrer.
      </p>
    </div>
  );
}

/** How often the position is saved while a video plays. */
const SAVE_EVERY_MS = 10_000;
/** From here on a video counts as watched to the end (credits, end screens). */
const FINISHED_PERCENT = 97;

/**
 * The embed, continuing where the learner stopped. The YouTube API attaches to the running
 * iframe to read the position (on pause, every few seconds and when the player closes);
 * without it the video still plays, only from the start.
 */
function ResumablePlayer({ entry }: { entry: DiscoverEntry }) {
  const id = seenId(entry);
  const savePosition = useDiscoverStore((s) => s.savePosition);
  // Read once: the iframe must not reload while positions are saved.
  const [resume] = useState<ResumeAt>(() => {
    const saved = useDiscoverStore.getState().progress[id];
    // Watched to the end: start over instead of at the last second.
    if ((watchedPercent(saved) ?? 0) >= FINISHED_PERCENT) return {};
    return { positionSec: saved?.positionSec, playlistIndex: saved?.playlistIndex };
  });
  const frameRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    let player: YouTubePlayer | null = null;
    let timer: number | undefined;
    let cancelled = false;
    const save = () => {
      // The player's methods exist only once it is ready.
      if (typeof player?.getCurrentTime !== 'function') return;
      const index = player.getPlaylistIndex?.();
      const duration = player.getDuration();
      void savePosition(
        id,
        player.getCurrentTime(),
        index !== undefined && index >= 0 ? index : undefined,
        duration
      );
    };
    loadYouTubeApi()
      .then((YT) => {
        if (cancelled || !frameRef.current) return;
        player = attachPlayer(YT, frameRef.current, (state) => {
          // Finished (ENDED): 100 %; the next play starts from the beginning again.
          if (state === YT.PlayerState.PAUSED || state === YT.PlayerState.ENDED) save();
        });
        timer = window.setInterval(save, SAVE_EVERY_MS);
      })
      .catch((error: unknown) => {
        log.info('YouTube API unavailable; playing without resume', {
          message: error instanceof Error ? error.message : String(error),
        });
      });
    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearInterval(timer);
      save();
    };
  }, [id, savePosition]);

  return (
    <div className="video-frame">
      <iframe
        ref={frameRef}
        title={entry.title}
        // origin lets the YouTube API talk to this page (postMessage) safely.
        src={`${discoverEmbedUrl(entry, resume)}&origin=${encodeURIComponent(window.location.origin)}`}
        allow="autoplay; encrypted-media; picture-in-picture"
        allowFullScreen
      />
    </div>
  );
}

/** Seen, started, pin/unpin: the same actions on a card and in the player. */
function ItemActions({ entry }: { entry: DiscoverEntry }) {
  const seen = useListenStore((s) => Boolean(s.progress[seenId(entry)]?.completedAt));
  const markSeen = useListenStore((s) => s.markSeen);
  const state = useDiscoverStore((s) => s.progress[seenId(entry)]);
  const setPinned = useDiscoverStore((s) => s.setPinned);
  const celebrate = useCelebrationStore((s) => s.show);

  const confirmSeen = async () => {
    if (await markSeen(seenId(entry), youtubeUrl(entry))) {
      celebrate({ title: 'Video gesehen', xp: XP_RULES.trackHeard, big: false });
    }
  };

  if (seen) {
    return (
      <span className="badge badge-done" style={{ alignSelf: 'start' }}>
        <Icon name="check" size={14} strokeWidth={2.6} /> Gesehen
      </span>
    );
  }
  return (
    <div className="row" style={{ gap: '0.5rem' }}>
      {state?.startedAt && <span className="badge">{startedLabel(state)}</span>}
      <button className="btn" onClick={() => void confirmSeen()}>
        Als gesehen markieren
      </button>
      <button
        className="btn"
        aria-pressed={Boolean(state?.pinned)}
        aria-label={`${entry.title} ${state?.pinned ? 'lösen' : 'anheften'}`}
        onClick={() => void setPinned(seenId(entry), !state?.pinned)}
      >
        {state?.pinned ? 'Lösen' : 'Anheften'}
      </button>
    </div>
  );
}

/** "Angefangen · 40 % geschaut" (with the video number for playlists). */
function startedLabel(state: DiscoverProgress): string {
  const percent = watchedPercent(state);
  const where = state.playlistIndex ? `Video ${state.playlistIndex + 1}: ` : '';
  if (percent !== null && percent > 0)
    return `Angefangen · ${where}${percent} % geschaut`;
  if ((state.positionSec ?? 0) >= 5) {
    return `Angefangen · ${where}bei ${formatPosition(state.positionSec!)}`;
  }
  return 'Angefangen';
}

function DiscoverCard({
  entry,
  playing,
  onPlay,
}: {
  entry: DiscoverEntry;
  playing: boolean;
  onPlay(): void;
}) {
  const thumb = discoverThumbnail(entry);
  const { channel } = entry;
  const percent = watchedPercent(useDiscoverStore((s) => s.progress[seenId(entry)]));

  return (
    <li className={`card stack discover-card discover-${channel.category}`}>
      <button
        className="discover-thumb"
        onClick={onPlay}
        aria-label={`${entry.title} abspielen`}
      >
        {thumb ? <img src={thumb} alt="" loading="lazy" /> : null}
        <span className="video-play">
          <Icon name="play" size={24} />
        </span>
        {playing && <span className="discover-tag discover-tag-live">Läuft oben</span>}
        {!playing && entry.type === 'playlist' && (
          <span className="discover-tag">Playlist</span>
        )}
        {entry.minutes ? (
          <span className="discover-duration">{entry.minutes} Min.</span>
        ) : null}
        {percent !== null && percent > 0 && (
          <span
            className="discover-watched"
            role="progressbar"
            aria-label={`${entry.title}: ${percent} % geschaut`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent}
          >
            <span style={{ width: `${percent}%` }} />
          </span>
        )}
      </button>
      <span className="eyebrow discover-category">
        {CATEGORY_LABELS[channel.category]} · Stufe {channel.level} · {channel.variety}
      </span>
      <strong>{entry.title}</strong>
      <span className="muted" style={{ fontSize: '0.9rem' }}>
        <a href={channel.url} target="_blank" rel="noreferrer">
          {channel.title}
        </a>{' '}
        · auf {channel.language}
      </span>
      <p className="muted" style={{ margin: 0, fontStyle: 'italic' }}>
        „{entry.why}“
      </p>
      <ItemActions entry={entry} />
    </li>
  );
}
