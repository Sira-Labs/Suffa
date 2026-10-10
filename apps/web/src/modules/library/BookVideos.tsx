import { useEffect, useState, type MouseEvent } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import type { BookVideo } from '@/types';
import { Icon } from '@/components/Icon';
import { logger } from '@/services/logger';
import {
  embedUrl,
  loadBookVideos,
  thumbnailUrl,
  videosForUnit,
  type BookVideoData,
} from '@/services/video/bookVideos';

const log = logger.child('library:video');

/**
 * The publisher's page videos for one unit: a chip per book page, then the video. The YouTube
 * player (no-cookie domain) loads only after the learner presses play; before that only the
 * thumbnail is shown. Learners follow along in their printed book.
 */
export function BookVideos({ unit }: { unit: number }) {
  const { t } = useTranslation('library');
  const [data, setData] = useState<BookVideoData | null>(null);
  const [failed, setFailed] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadBookVideos()
      .then((loaded) => !cancelled && setData(loaded))
      .catch((error: unknown) => {
        log.error('Book video index could not be loaded', {
          message: error instanceof Error ? error.message : String(error),
        });
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // A new unit starts at its first video, with the player closed again.
  useEffect(() => {
    setSelectedId(null);
    setPlaying(false);
  }, [unit]);

  if (failed) return <p className="muted">{t('videos.failed')}</p>;
  if (!data) return <p className="muted">{t('videos.loading')}</p>;

  const unitVideos = videosForUnit(data, unit);
  const playlist = data.index.source.playlist;
  if (!unitVideos || unitVideos.videos.length === 0) {
    return (
      <p className="muted" style={{ margin: 0 }}>
        {t('videos.none', { unit })}{' '}
        <a href={playlist} target="_blank" rel="noreferrer">
          {t('videos.playlist')}
        </a>
      </p>
    );
  }

  const { videos } = unitVideos;
  // Scroll instead of a #fragment: the section sits inside a page that may re-render.
  const toAudio = (event: MouseEvent) => {
    event.preventDefault();
    document.getElementById('audio-heading')?.scrollIntoView?.({ behavior: 'smooth' });
  };
  const selected = videos.find((v) => v.id === selectedId) ?? videos[0]!;
  const choose = (video: BookVideo) => {
    setSelectedId(video.id);
    setPlaying(false);
  };

  return (
    <div className="stack">
      <p className="muted" style={{ margin: 0 }}>
        <Trans
          t={t}
          i18nKey="videos.intro"
          values={{
            pages:
              t('videos.pages', {
                count: videos.length,
                from: unitVideos.from,
                to: unitVideos.to,
              }) + (unitVideos.estimated ? t('videos.estimated') : ''),
            notEveryPage:
              unit === 1 ? t('videos.notEveryPageUnit1') : t('videos.notEveryPage'),
          }}
          components={{ 1: <a href="#audio-heading" onClick={toAudio} /> }}
        />
      </p>
      <div className="row page-chips" role="group" aria-label={t('videos.choosePage')}>
        {videos.map((video) => (
          <button
            key={video.id}
            className={`btn page-chip${video.id === selected.id ? ' btn-accent' : ''}`}
            aria-pressed={video.id === selected.id}
            aria-label={t(video.approx ? 'videos.forPageApprox' : 'videos.forPage', {
              page: video.page,
            })}
            onClick={() => choose(video)}
          >
            {t(video.approx ? 'videos.pageChipApprox' : 'videos.pageChip', {
              page: video.page,
            })}
          </button>
        ))}
      </div>
      <div className="video-frame">
        {playing ? (
          <iframe
            title={t('videos.forPage', { page: selected.page })}
            src={embedUrl(selected, true)}
            allow="autoplay; encrypted-media; picture-in-picture"
            allowFullScreen
          />
        ) : (
          <button
            className="video-poster"
            onClick={() => setPlaying(true)}
            aria-label={t('videos.play', { page: selected.page })}
          >
            <img src={thumbnailUrl(selected)} alt="" loading="lazy" />
            <span className="video-play">
              <Icon name="play" size={28} />
            </span>
          </button>
        )}
      </div>
      <p className="muted" style={{ fontSize: '0.85em', margin: 0 }}>
        {t('videos.credit', { publisher: data.index.source.publisher })}
      </p>
    </div>
  );
}
