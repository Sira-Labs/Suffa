/**
 * Class recordings (Sprint 7): teachers upload session recordings (large files in resumable
 * parts), see the processing progress, publish after confirming consent, and delete. Learners
 * see the published ones and open the player.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { MediaApi, type MediaItem } from '@/services/media/mediaApi';
import { putPart, uploadRecording } from '@/services/media/uploader';
import { useListenStore } from '@/state';

const STATUS: Record<MediaItem['status'], string> = {
  uploading: 'Upload läuft',
  importing: 'Import läuft',
  processing: 'Wird verarbeitet',
  ready: 'Bereit',
  failed: 'Fehlgeschlagen',
};

export function formatDuration(seconds: number | null): string {
  if (!seconds) return '';
  const s = Math.round(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h} h ${m} min` : `${Math.max(1, m)} min`;
}

export function ClassRecordings({
  classId,
  teacher,
}: {
  classId: string;
  teacher: boolean;
}) {
  const api = useMemo(() => new MediaApi(), []);
  const [items, setItems] = useState<MediaItem[] | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const progress = useListenStore((s) => s.progress);

  const load = useCallback(async () => {
    const result = await api.list(classId);
    if (result.ok) setItems(result.value.items);
    else setMessage(result.message);
  }, [api, classId]);

  useEffect(() => {
    void load();
  }, [load]);

  // While something is being processed, look again every few seconds.
  const busy = items?.some((i) => i.status === 'processing' || i.status === 'importing');
  useEffect(() => {
    if (!busy) return;
    const timer = window.setInterval(() => void load(), 5000);
    return () => window.clearInterval(timer);
  }, [busy, load]);

  const act = async (run: () => Promise<{ ok: boolean; message?: string }>) => {
    const result = await run();
    setMessage(result.ok ? null : (result.message ?? null));
    await load();
  };

  if (!items) return <p className="muted">{message ?? 'Lade Aufnahmen …'}</p>;

  return (
    <div className="stack" style={{ gap: '1rem' }}>
      {teacher && <UploadForm api={api} classId={classId} onDone={load} />}
      {message && <p className="feedback-bad">{message}</p>}
      {items.length === 0 ? (
        <p className="muted">
          {teacher
            ? 'Noch keine Aufnahmen. Lade die Aufnahme einer Unterrichtsstunde hoch.'
            : 'Noch keine Aufnahmen veröffentlicht.'}
        </p>
      ) : (
        <ul className="feed-list">
          {items.map((item) => {
            const heard = progress[`rec/${item.id}`];
            return (
              <li key={item.id} className="feed-item stack" style={{ gap: '0.4rem' }}>
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  {item.status === 'ready' ? (
                    <Link to={`/classes/${classId}/recordings/${item.id}`}>
                      <strong>{item.title}</strong>
                    </Link>
                  ) : (
                    <strong>{item.title}</strong>
                  )}
                  <span className="muted" style={{ fontSize: '0.85rem' }}>
                    {item.hasVideo ? 'Video' : 'Audio'} {formatDuration(item.durationSec)}
                    {heard?.completedAt ? ' · ✓ gehört' : ''}
                  </span>
                </div>
                {teacher && (
                  <span className="muted" style={{ fontSize: '0.85rem' }}>
                    {STATUS[item.status]}
                    {item.status === 'processing' && ` · ${item.progress} %`}
                    {item.status === 'ready' &&
                      (item.publishedAt
                        ? ' · veröffentlicht'
                        : ' · nur für dich sichtbar')}
                    {item.error && ` · ${item.error}`}
                  </span>
                )}
                {teacher && item.status === 'processing' && (
                  <span
                    className="review-progress"
                    role="progressbar"
                    aria-label={`${item.title} wird verarbeitet`}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={item.progress}
                  >
                    <span
                      style={{
                        display: 'block',
                        height: '100%',
                        width: `${item.progress}%`,
                      }}
                    />
                  </span>
                )}
                {teacher && (
                  <div className="row">
                    {item.status === 'ready' && !item.publishedAt && (
                      <PublishButton
                        onPublish={() => act(() => api.publish(classId, item.id))}
                      />
                    )}
                    <button
                      className="btn btn-small"
                      onClick={() => {
                        if (window.confirm(`„${item.title}“ endgültig löschen?`)) {
                          void act(() => api.remove(classId, item.id));
                        }
                      }}
                    >
                      Löschen
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function PublishButton({ onPublish }: { onPublish: () => Promise<void> }) {
  const [consent, setConsent] = useState(false);
  return (
    <span className="row" style={{ flexWrap: 'wrap' }}>
      <label className="row" style={{ gap: '0.35rem', fontSize: '0.85rem' }}>
        <input
          type="checkbox"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
        />
        Alle, die zu sehen oder zu hören sind, sind einverstanden
      </label>
      <button
        className="btn btn-small btn-primary"
        disabled={!consent}
        onClick={() => void onPublish()}
      >
        Für die Klasse veröffentlichen
      </button>
    </span>
  );
}

function UploadForm({
  api,
  classId,
  onDone,
}: {
  api: MediaApi;
  classId: string;
  onDone: () => Promise<void>;
}) {
  const [title, setTitle] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [sent, setSent] = useState<{ sent: number; total: number } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;
    abort.current = new AbortController();
    setMessage(null);
    const result = await uploadRecording(
      {
        api,
        put: putPart,
        sleep: (ms) => new Promise((r) => window.setTimeout(r, ms)),
        storage: window.localStorage,
      },
      classId,
      file,
      title.trim() || file.name,
      (p) => setSent({ sent: p.sentBytes, total: p.totalBytes }),
      abort.current.signal
    );
    abort.current = null;
    setSent(null);
    if (!result.ok) return setMessage(result.message);
    setTitle('');
    setFile(null);
    setMessage('Hochgeladen – die Aufnahme wird jetzt verarbeitet.');
    await onDone();
  };

  const uploading = sent !== null;
  return (
    <form
      className="card stack"
      aria-label="Aufnahme hochladen"
      onSubmit={(e) => void submit(e)}
    >
      <strong>Aufnahme hochladen</strong>
      <input
        className="input"
        aria-label="Titel"
        placeholder="Titel, z. B. Stunde 3 – Einheit 2"
        maxLength={120}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        disabled={uploading}
      />
      <input
        type="file"
        aria-label="Datei"
        accept="audio/*,video/*"
        disabled={uploading}
        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
      />
      {uploading && (
        <span
          className="review-progress"
          role="progressbar"
          aria-label="Upload"
          aria-valuemin={0}
          aria-valuemax={sent.total}
          aria-valuenow={sent.sent}
        >
          <span
            style={{
              display: 'block',
              height: '100%',
              width: `${(sent.sent / Math.max(1, sent.total)) * 100}%`,
            }}
          />
        </span>
      )}
      <div className="row">
        {uploading ? (
          <button className="btn" type="button" onClick={() => abort.current?.abort()}>
            Anhalten
          </button>
        ) : (
          <button className="btn btn-primary" type="submit" disabled={!file}>
            Hochladen
          </button>
        )}
        <span className="muted" style={{ fontSize: '0.85rem' }}>
          Audio oder Video bis 10 GB. Bricht die Verbindung ab, wähle dieselbe Datei
          erneut – der Upload geht dort weiter.
        </span>
      </div>
      {message && <span className="muted">{message}</span>}
    </form>
  );
}
