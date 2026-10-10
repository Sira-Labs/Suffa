/**
 * Admin tab "Videos" (stories 12.1, 12.4): channels with their playlists and the creator's
 * permission (status, notes, contact date), the import from YouTube, and each video's unit
 * and visibility. Checkpoints and the transcript are edited on the lesson page itself.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { dateLocale } from '@/i18n/format';
import {
  VideosApi,
  type AdminVideo,
  type PermissionStatus,
  type VideoChannel,
} from '@/services/videos/videosApi';
import { COURSES, DEFAULT_COURSE, type CourseId } from '@suffa/engagement';
import { unitLabel } from '@/services/courses';

const PERMISSIONS: PermissionStatus[] = ['unknown', 'requested', 'granted', 'declined'];

export function VideoAdmin({ api: injected }: { api?: VideosApi }) {
  const { t } = useTranslation('admin');
  const api = useMemo(() => injected ?? new VideosApi(), [injected]);
  const [data, setData] = useState<{
    channels: VideoChannel[];
    videos: AdminVideo[];
    importEnabled: boolean;
  } | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    const result = await api.adminOverview();
    if (result.ok) setData(result.value);
    else setMessage(result.message);
  }, [api]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!data)
    return message ? (
      <span className="feedback-bad">{message}</span>
    ) : (
      <p className="muted">{t('loading')}</p>
    );

  return (
    <div className="stack">
      {message && <span className="feedback-bad">{message}</span>}
      {data.channels.map((c) => (
        <ChannelCard
          key={c.id}
          api={api}
          channel={c}
          videos={data.videos.filter((v) => v.channelId === c.id)}
          importEnabled={data.importEnabled}
          onChange={load}
          onMessage={setMessage}
        />
      ))}
      <NewChannel api={api} onCreated={load} />
    </div>
  );
}

function ChannelCard({
  api,
  channel,
  videos,
  importEnabled,
  onChange,
  onMessage,
}: {
  api: VideosApi;
  channel: VideoChannel;
  videos: AdminVideo[];
  importEnabled: boolean;
  onChange: () => Promise<void>;
  onMessage: (m: string | null) => void;
}) {
  const { t } = useTranslation(['admin', 'common']);
  const [course, setCourse] = useState<CourseId>(channel.course ?? DEFAULT_COURSE);
  const [status, setStatus] = useState<PermissionStatus>(channel.permissionStatus);
  const [notes, setNotes] = useState(channel.permissionNotes);
  const [contacted, setContacted] = useState(channel.contactedAt ?? '');
  const [playlists, setPlaylists] = useState(channel.playlists.join('\n'));
  const [saved, setSaved] = useState(false);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const result = await api.updateChannel(channel.id, {
      course,
      permissionStatus: status,
      permissionNotes: notes,
      contactedAt: contacted || null,
      playlists: playlists
        .split(/[\s,]+/)
        .map((p) => p.trim())
        .filter(Boolean),
    });
    if (!result.ok) return onMessage(result.message);
    onMessage(null);
    setSaved(true);
    await onChange();
  };

  const runImport = async () => {
    const result = await api.importChannel(channel.id);
    onMessage(result.ok ? t('videos.importStarted') : result.message);
  };

  const update = async (
    v: AdminVideo,
    patch: { unit?: number | null; hidden?: boolean }
  ) => {
    const result = await api.updateVideo(v.id, patch);
    if (!result.ok) return onMessage(result.message);
    await onChange();
  };

  return (
    <section
      className="card stack"
      aria-label={t('videos.channel', { name: channel.name })}
    >
      <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <strong>{channel.name}</strong>
        <span className="muted">
          {t('videos.videoCount', { count: channel.videoCount })}
          {channel.lastImportAt
            ? t('videos.lastImportAt', {
                date: new Date(channel.lastImportAt).toLocaleString(dateLocale(), {
                  dateStyle: 'short',
                  timeStyle: 'short',
                }),
              })
            : ''}
        </span>
      </div>
      {channel.lastImportError && (
        <span className="feedback-bad">
          {t('videos.lastImportError', { error: channel.lastImportError })}
        </span>
      )}
      <form className="stack" onSubmit={(e) => void save(e)}>
        <div className="row" style={{ gap: '0.75rem', flexWrap: 'wrap' }}>
          <CourseSelect value={course} onChange={setCourse} />
          <label className="stack" style={{ gap: 2 }}>
            <span className="muted">{t('videos.permission')}</span>
            <select
              className="input"
              value={status}
              onChange={(e) => setStatus(e.target.value as PermissionStatus)}
            >
              {PERMISSIONS.map((s) => (
                <option key={s} value={s}>
                  {t(`videos.permissions.${s}`)}
                </option>
              ))}
            </select>
          </label>
          <label className="stack" style={{ gap: 2 }}>
            <span className="muted">{t('videos.contacted')}</span>
            <input
              className="input"
              type="date"
              value={contacted}
              onChange={(e) => setContacted(e.target.value)}
            />
          </label>
        </div>
        <label className="stack" style={{ gap: 2 }}>
          <span className="muted">{t('videos.notes')}</span>
          <textarea
            className="input"
            rows={2}
            maxLength={4000}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </label>
        <label className="stack" style={{ gap: 2 }}>
          <span className="muted">{t('videos.playlists')}</span>
          <textarea
            className="input"
            rows={2}
            value={playlists}
            onChange={(e) => setPlaylists(e.target.value)}
          />
        </label>
        <div className="row" style={{ gap: '0.5rem', flexWrap: 'wrap' }}>
          <button className="btn btn-primary" type="submit">
            {t('common:save')}
          </button>
          <button
            className="btn"
            type="button"
            disabled={!importEnabled}
            title={importEnabled ? undefined : t('videos.importKeyMissing')}
            onClick={() => void runImport()}
          >
            {t('videos.import')}
          </button>
          {saved && <span className="muted">{t('common:saved')}</span>}
        </div>
      </form>
      {videos.length > 0 && (
        <details>
          <summary>{t('videos.list', { n: videos.length })}</summary>
          <table style={{ width: '100%' }}>
            <tbody>
              {videos.map((v) => (
                <tr key={v.id}>
                  <td dir="auto">
                    <Link to={`/videos/${v.id}`}>{v.title}</Link>
                  </td>
                  <td>
                    <select
                      className="input"
                      aria-label={t('videos.unitOf', { title: v.title })}
                      value={v.unit ?? ''}
                      onChange={(e) =>
                        void update(v, {
                          unit: e.target.value ? Number(e.target.value) : null,
                        })
                      }
                    >
                      <option value="">–</option>
                      {COURSES.map((course) => (
                        <optgroup key={course.id} label={course.name}>
                          {course.units.map((u) => (
                            <option key={u} value={u}>
                              {unitLabel(u)}
                            </option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                  </td>
                  <td>
                    <label>
                      <input
                        type="checkbox"
                        checked={!v.hidden}
                        onChange={(e) => void update(v, { hidden: !e.target.checked })}
                      />{' '}
                      {t('videos.visible')}
                    </label>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      )}
    </section>
  );
}

function NewChannel({
  api,
  onCreated,
}: {
  api: VideosApi;
  onCreated: () => Promise<void>;
}) {
  const { t } = useTranslation('admin');
  const [name, setName] = useState('');
  const [course, setCourse] = useState<CourseId>(DEFAULT_COURSE);
  const [playlist, setPlaylist] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const result = await api.createChannel({
      name: name.trim(),
      course,
      playlists: playlist.trim() ? [playlist.trim()] : [],
    });
    if (!result.ok) return setMessage(result.message);
    setName('');
    setPlaylist('');
    setMessage(null);
    await onCreated();
  };
  return (
    <form className="card stack" onSubmit={(e) => void submit(e)}>
      <strong>{t('videos.newChannel')}</strong>
      <input
        className="input"
        placeholder={t('videos.namePlaceholder')}
        aria-label={t('videos.name')}
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <CourseSelect value={course} onChange={setCourse} />
      <input
        className="input"
        placeholder={t('videos.playlistPlaceholder')}
        aria-label={t('videos.playlist')}
        value={playlist}
        onChange={(e) => setPlaylist(e.target.value)}
      />
      <div className="row">
        <button className="btn btn-primary" type="submit" disabled={!name.trim()}>
          {t('videos.create')}
        </button>
        {message && <span className="feedback-bad">{message}</span>}
      </div>
    </form>
  );
}

/** The course a channel teaches: the import reads "Lesson n" as that course's lesson n. */
function CourseSelect({
  value,
  onChange,
}: {
  value: CourseId;
  onChange: (course: CourseId) => void;
}) {
  const { t } = useTranslation('admin');
  return (
    <label className="stack" style={{ gap: 2 }}>
      <span className="muted">{t('videos.course')}</span>
      <select
        className="input"
        value={value}
        onChange={(e) => onChange(e.target.value as CourseId)}
      >
        {COURSES.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
    </label>
  );
}
