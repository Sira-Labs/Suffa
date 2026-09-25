/**
 * Admin tab "Videos" (stories 12.1, 12.4): channels with their playlists and the creator's
 * permission (status, notes, contact date), the import from YouTube, and each video's unit
 * and visibility. Checkpoints and the transcript are edited on the lesson page itself.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  PERMISSION_LABELS,
  VideosApi,
  type AdminVideo,
  type PermissionStatus,
  type VideoChannel,
} from '@/services/videos/videosApi';

const UNITS = Array.from({ length: 16 }, (_, i) => i + 1);

export function VideoAdmin({ api: injected }: { api?: VideosApi }) {
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
      <p className="muted">Lade …</p>
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
  const [status, setStatus] = useState<PermissionStatus>(channel.permissionStatus);
  const [notes, setNotes] = useState(channel.permissionNotes);
  const [contacted, setContacted] = useState(channel.contactedAt ?? '');
  const [playlists, setPlaylists] = useState(channel.playlists.join('\n'));
  const [saved, setSaved] = useState(false);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const result = await api.updateChannel(channel.id, {
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
    onMessage(
      result.ok
        ? 'Import gestartet – die Liste füllt sich in einer Minute.'
        : result.message
    );
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
    <section className="card stack" aria-label={`Kanal ${channel.name}`}>
      <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <strong>{channel.name}</strong>
        <span className="muted">
          {channel.videoCount} Videos
          {channel.lastImportAt
            ? ` · Import ${new Date(channel.lastImportAt).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })}`
            : ''}
        </span>
      </div>
      {channel.lastImportError && (
        <span className="feedback-bad">Letzter Import: {channel.lastImportError}</span>
      )}
      <form className="stack" onSubmit={(e) => void save(e)}>
        <div className="row" style={{ gap: '0.75rem', flexWrap: 'wrap' }}>
          <label className="stack" style={{ gap: 2 }}>
            <span className="muted">Erlaubnis der Autoren</span>
            <select
              className="input"
              value={status}
              onChange={(e) => setStatus(e.target.value as PermissionStatus)}
            >
              {(Object.keys(PERMISSION_LABELS) as PermissionStatus[]).map((s) => (
                <option key={s} value={s}>
                  {PERMISSION_LABELS[s]}
                </option>
              ))}
            </select>
          </label>
          <label className="stack" style={{ gap: 2 }}>
            <span className="muted">Kontaktiert am</span>
            <input
              className="input"
              type="date"
              value={contacted}
              onChange={(e) => setContacted(e.target.value)}
            />
          </label>
        </div>
        <label className="stack" style={{ gap: 2 }}>
          <span className="muted">Notizen zur Anfrage</span>
          <textarea
            className="input"
            rows={2}
            maxLength={4000}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </label>
        <label className="stack" style={{ gap: 2 }}>
          <span className="muted">Playlists (IDs, eine pro Zeile)</span>
          <textarea
            className="input"
            rows={2}
            value={playlists}
            onChange={(e) => setPlaylists(e.target.value)}
          />
        </label>
        <div className="row" style={{ gap: '0.5rem', flexWrap: 'wrap' }}>
          <button className="btn btn-primary" type="submit">
            Speichern
          </button>
          <button
            className="btn"
            type="button"
            disabled={!importEnabled}
            title={importEnabled ? undefined : 'SUFFA_YOUTUBE_API_KEY fehlt'}
            onClick={() => void runImport()}
          >
            Von YouTube importieren
          </button>
          {saved && <span className="muted">Gespeichert.</span>}
        </div>
      </form>
      {videos.length > 0 && (
        <details>
          <summary>Videos ({videos.length})</summary>
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
                      aria-label={`Einheit von ${v.title}`}
                      value={v.unit ?? ''}
                      onChange={(e) =>
                        void update(v, {
                          unit: e.target.value ? Number(e.target.value) : null,
                        })
                      }
                    >
                      <option value="">–</option>
                      {UNITS.map((u) => (
                        <option key={u} value={u}>
                          Einheit {u}
                        </option>
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
                      sichtbar
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
  const [name, setName] = useState('');
  const [playlist, setPlaylist] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const result = await api.createChannel({
      name: name.trim(),
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
      <strong>Neuer Kanal</strong>
      <input
        className="input"
        placeholder="Name, z. B. Muhammad al-Andalusi"
        aria-label="Name des Kanals"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <input
        className="input"
        placeholder="Playlist-ID (PL…)"
        aria-label="Playlist-ID"
        value={playlist}
        onChange={(e) => setPlaylist(e.target.value)}
      />
      <div className="row">
        <button className="btn btn-primary" type="submit" disabled={!name.trim()}>
          Anlegen
        </button>
        {message && <span className="feedback-bad">{message}</span>}
      </div>
    </form>
  );
}
