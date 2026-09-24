import { useEffect, useMemo, useState } from 'react';
import type { DiscoverCatalog, DiscoverCategory, DiscoverEntry } from '@/types';
import { Icon } from '@/components/Icon';
import { logger } from '@/services/logger';
import {
  CATEGORY_LABELS,
  discoverEmbedUrl,
  discoverThumbnail,
  entries as allEntries,
  levelIncludes,
  loadDiscover,
  seenId,
  weeklyPick,
  youtubeUrl,
} from '@/services/discover';
import { XP_RULES } from '@/services/engagement/xp';
import { useCelebrationStore, useListenStore } from '@/state';

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
 * be marked as seen for XP.
 */
export function Discover() {
  const [catalog, setCatalog] = useState<DiscoverCatalog | null>(null);
  const [failed, setFailed] = useState(false);
  const [filter, setFilter] = useState<Filter>('mine');
  const [playing, setPlaying] = useState<string | null>(null);

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
  const visible =
    filter === 'mine' ? forLevel : list.filter((e) => e.channel.category === filter);
  const pick = weeklyPick(forLevel);

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
            : 'In dieser Kategorie gibt es noch keine Empfehlungen.'}
        </p>
      ) : (
        <ul className="discover-list" aria-label="Empfehlungen">
          {visible.map((entry) => (
            <DiscoverCard
              key={`${entry.channel.handle}-${entry.id}`}
              entry={entry}
              playing={playing === entry.id}
              onPlay={() => setPlaying(entry.id)}
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

function DiscoverCard({
  entry,
  playing,
  onPlay,
}: {
  entry: DiscoverEntry;
  playing: boolean;
  onPlay(): void;
}) {
  const seen = useListenStore((s) => Boolean(s.progress[seenId(entry)]?.completedAt));
  const markSeen = useListenStore((s) => s.markSeen);
  const celebrate = useCelebrationStore((s) => s.show);
  const thumb = discoverThumbnail(entry);
  const { channel } = entry;

  const confirmSeen = async () => {
    if (await markSeen(seenId(entry), youtubeUrl(entry))) {
      celebrate({ title: 'Video gesehen', xp: XP_RULES.trackHeard, big: false });
    }
  };

  return (
    <li className={`card stack discover-card discover-${channel.category}`}>
      {playing ? (
        <div className="video-frame">
          <iframe
            title={entry.title}
            src={discoverEmbedUrl(entry)}
            allow="autoplay; encrypted-media; picture-in-picture"
            allowFullScreen
          />
        </div>
      ) : (
        <button
          className="discover-thumb"
          onClick={onPlay}
          aria-label={`${entry.title} abspielen`}
        >
          {thumb ? <img src={thumb} alt="" loading="lazy" /> : null}
          <span className="video-play">
            <Icon name="play" size={24} />
          </span>
          {entry.type === 'playlist' && <span className="discover-tag">Playlist</span>}
          {entry.minutes ? (
            <span className="discover-duration">{entry.minutes} Min.</span>
          ) : null}
        </button>
      )}
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
      {seen ? (
        <span className="badge badge-done" style={{ alignSelf: 'start' }}>
          <Icon name="check" size={14} strokeWidth={2.6} /> Gesehen
        </span>
      ) : (
        <button
          className="btn"
          style={{ alignSelf: 'start' }}
          onClick={() => void confirmSeen()}
        >
          Als gesehen markieren
        </button>
      )}
    </li>
  );
}
