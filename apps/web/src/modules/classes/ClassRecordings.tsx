/**
 * Class recordings (Sprint 7): teachers upload session recordings (large files in resumable
 * parts), see the processing progress, publish after confirming consent, delete, and see who
 * of the class has listened to each published one. Learners see the published ones and open
 * the player.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import {
  MediaApi,
  type MediaItem,
  type RecordingListening,
} from '@/services/media/mediaApi';
import { putPart, uploadRecording } from '@/services/media/uploader';
import { useListenStore } from '@/state';
import { DriveImport } from './DriveImport';
import { isRecordingFile } from '@/services/media/recordingFile';
import { InteractiveApi } from '@/services/media/interactiveApi';

/** "1 h 5 min" or "12 min" (the same in German and English). */
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
  const { t } = useTranslation(['recordings', 'classes']);
  const api = useMemo(() => new MediaApi(), []);
  const [items, setItems] = useState<MediaItem[] | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [listening, setListening] = useState<Map<string, RecordingListening>>(new Map());
  const [listeningError, setListeningError] = useState<string | null>(null);
  const progress = useListenStore((s) => s.progress);
  // Loads overlap (polling, actions); only the newest one may write its answers.
  const latest = useRef(0);
  const inFlight = useRef(0);

  const loadInto = useCallback(
    async (request: number) => {
      const result = await api.list(classId);
      if (request !== latest.current) return;
      if (result.ok) setItems(result.value.items);
      else setMessage(result.message);
      if (teacher) {
        const heard = await api.listening(classId);
        if (request !== latest.current) return;
        if (heard.ok) {
          setListening(new Map(heard.value.recordings.map((r) => [r.mediaId, r])));
          setListeningError(null);
        } else {
          setListeningError(heard.message);
        }
      }
    },
    [api, classId, teacher]
  );

  const load = useCallback(async () => {
    const request = ++latest.current;
    inFlight.current += 1;
    try {
      await loadInto(request);
    } finally {
      inFlight.current -= 1;
    }
  }, [loadInto]);

  // A new class (or role) makes answers still on their way stale.
  useEffect(
    () => () => {
      latest.current += 1;
    },
    [classId, teacher]
  );

  useEffect(() => {
    void load();
  }, [load]);

  // While something is being processed, look again every few seconds.
  const busy = items?.some((i) => i.status === 'processing' || i.status === 'importing');
  useEffect(() => {
    if (!busy) return;
    // A slow answer is waited for, not overtaken (it would be discarded as stale).
    const timer = window.setInterval(() => {
      if (inFlight.current === 0) void load();
    }, 5000);
    return () => window.clearInterval(timer);
  }, [busy, load]);

  const act = async (
    run: () => Promise<{ ok: boolean; message?: string }>
  ): Promise<boolean> => {
    const result = await run();
    setMessage(result.ok ? null : (result.message ?? null));
    await load();
    return result.ok;
  };

  if (!items) return <p className="muted">{message ?? t('loading')}</p>;

  return (
    <div className="stack" style={{ gap: '1rem' }}>
      {teacher && <UploadForm api={api} classId={classId} onDone={load} />}
      {teacher && <DriveImport classId={classId} onImported={() => void load()} />}
      {teacher && <AiSwitch classId={classId} />}
      {message && <p className="feedback-bad">{message}</p>}
      {teacher && listeningError && (
        <p className="feedback-bad row" style={{ flexWrap: 'wrap' }}>
          <span>{t('listeningError', { message: listeningError })}</span>
          <button type="button" className="btn" onClick={() => void load()}>
            {t('reload')}
          </button>
        </p>
      )}
      {items.length === 0 ? (
        <p className="muted">{teacher ? t('emptyTeacher') : t('emptyLearner')}</p>
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
                    {item.hasVideo ? t('video') : t('audio')}{' '}
                    {formatDuration(item.durationSec)}
                    {heard?.completedAt ? ` · ${t('heard')}` : ''}
                  </span>
                </div>
                {teacher && (
                  <span className="muted" style={{ fontSize: '0.85rem' }}>
                    {t(`status.${item.status}`)}
                    {item.status === 'processing' &&
                      ` · ${t('classes:percent', { value: item.progress })}`}
                    {item.status === 'ready' &&
                      ` · ${item.publishedAt ? t('published') : t('onlyYou')}`}
                    {item.error && ` · ${item.error}`}
                  </span>
                )}
                {teacher && listening.get(item.id) && (
                  <ListeningSummary
                    title={item.title}
                    listening={listening.get(item.id)!}
                  />
                )}
                {teacher && item.status === 'processing' && (
                  <span
                    className="review-progress"
                    role="progressbar"
                    aria-label={t('processingLabel', { title: item.title })}
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
                    <RenameButton
                      title={item.title}
                      onRename={(title) => act(() => api.rename(classId, item.id, title))}
                    />
                    <button
                      className="btn btn-small"
                      onClick={() => {
                        if (window.confirm(t('deleteConfirm', { title: item.title }))) {
                          void act(() => api.remove(classId, item.id));
                        }
                      }}
                    >
                      {t('delete')}
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

/** Change a recording's title in place (e.g. after uploading under the wrong name). */
function RenameButton({
  title,
  onRename,
}: {
  title: string;
  onRename: (title: string) => Promise<boolean>;
}) {
  const { t } = useTranslation(['recordings', 'common']);
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(title);
  const [saving, setSaving] = useState(false);
  if (!editing) {
    return (
      <button
        className="btn btn-small"
        onClick={() => {
          setValue(title);
          setEditing(true);
        }}
      >
        {t('rename')}
      </button>
    );
  }
  const trimmed = value.trim();
  const save = async () => {
    if (!trimmed || saving) return;
    setSaving(true);
    const ok = await onRename(trimmed);
    setSaving(false);
    // On failure the editor stays open with the typed title; the error shows above the list.
    if (ok) setEditing(false);
  };
  return (
    <form
      className="row"
      style={{ flexWrap: 'wrap', gap: '0.4rem' }}
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <input
        className="input"
        aria-label={t('newTitle')}
        maxLength={120}
        value={value}
        autoFocus
        onChange={(e) => setValue(e.target.value)}
      />
      <button
        className="btn btn-small btn-primary"
        type="submit"
        disabled={!trimmed || saving}
      >
        {t('common:save')}
      </button>
      <button className="btn btn-small" type="button" onClick={() => setEditing(false)}>
        {t('common:cancel')}
      </button>
    </form>
  );
}

function PublishButton({ onPublish }: { onPublish: () => Promise<boolean> }) {
  const { t } = useTranslation('recordings');
  const [consent, setConsent] = useState(false);
  return (
    <span className="row" style={{ flexWrap: 'wrap' }}>
      <label className="row" style={{ gap: '0.35rem', fontSize: '0.85rem' }}>
        <input
          type="checkbox"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
        />
        {t('publishConsent')}
      </label>
      <button
        className="btn btn-small btn-primary"
        disabled={!consent}
        onClick={() => void onPublish()}
      >
        {t('publish')}
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
  const { t } = useTranslation('recordings');
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
    setMessage(t('upload.done'));
    await onDone();
  };

  const uploading = sent !== null;
  return (
    <form
      className="card stack"
      aria-label={t('upload.title')}
      onSubmit={(e) => void submit(e)}
    >
      <strong>{t('upload.title')}</strong>
      <input
        className="input"
        aria-label={t('upload.titleLabel')}
        placeholder={t('upload.titlePlaceholder')}
        maxLength={120}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        disabled={uploading}
      />
      <input
        type="file"
        aria-label={t('upload.file')}
        disabled={uploading}
        onChange={(e) => {
          const picked = e.target.files?.[0] ?? null;
          if (picked && !isRecordingFile(picked)) {
            setFile(null);
            e.target.value = '';
            setMessage(t('upload.wrongFile'));
            return;
          }
          setMessage(null);
          setFile(picked);
        }}
      />
      {uploading && (
        <span
          className="review-progress"
          role="progressbar"
          aria-label={t('upload.progress')}
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
            {t('upload.pause')}
          </button>
        ) : (
          <button className="btn btn-primary" type="submit" disabled={!file}>
            {t('upload.submit')}
          </button>
        )}
        <span className="muted" style={{ fontSize: '0.85rem' }}>
          {t('upload.hint')}
        </span>
      </div>
      {message && <span className="muted">{message}</span>}
    </form>
  );
}

/** Per-class AI switch (ADR-0018): off = recordings are never sent for transcription. */
function AiSwitch({ classId }: { classId: string }) {
  const { t } = useTranslation('recordings');
  const api = useMemo(() => new InteractiveApi(), []);
  const [enabled, setEnabled] = useState<boolean | null>(null);
  useEffect(() => {
    void api.settings(classId).then((r) => r.ok && setEnabled(r.value.aiEnabled));
  }, [api, classId]);
  if (enabled === null) return null;
  return (
    <label className="card row" style={{ justifyContent: 'space-between' }}>
      <span className="stack" style={{ gap: 0 }}>
        <strong>{t('ai.title')}</strong>
        <span className="muted" style={{ fontSize: '0.85rem' }}>
          {t('ai.hint')}
        </span>
      </span>
      <input
        type="checkbox"
        checked={enabled}
        onChange={(e) => {
          const next = e.target.checked;
          void api.setAiEnabled(classId, next).then((r) => r.ok && setEnabled(next));
        }}
      />
    </label>
  );
}

/** Who of the class has listened: counts at a glance, each learner's share on request. */
function ListeningSummary({
  title,
  listening,
}: {
  title: string;
  listening: RecordingListening;
}) {
  const { t } = useTranslation(['recordings', 'classes']);
  if (listening.learners === 0) {
    return (
      <span className="muted" style={{ fontSize: '0.85rem' }}>
        {t('listening.noLearners')}
      </span>
    );
  }
  return (
    <details className="listening">
      <summary>
        <Trans
          t={t}
          i18nKey="listening.summary"
          values={{ finished: listening.finished, learners: listening.learners }}
          components={{ 1: <strong /> }}
        />
        {listening.started > listening.finished &&
          t('listening.started', { count: listening.started - listening.finished })}
      </summary>
      <ul className="listening-list" aria-label={t('listening.who', { title })}>
        {listening.people.map((p) => (
          <li key={p.userId} className="row" style={{ justifyContent: 'space-between' }}>
            <span>{p.name}</span>
            <span className="row" style={{ gap: '0.5rem' }}>
              <span
                className="review-progress listening-bar"
                role="progressbar"
                aria-label={t('listening.person', { name: p.name, percent: p.percent })}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={p.percent}
              >
                <span
                  style={{ display: 'block', height: '100%', width: `${p.percent}%` }}
                />
              </span>
              <span className="muted" style={{ fontSize: '0.85rem', minWidth: '4.5rem' }}>
                {p.completedAt
                  ? t('heard')
                  : p.percent > 0
                    ? t('classes:percent', { value: p.percent })
                    : t('listening.notYet')}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </details>
  );
}
