/**
 * The teacher's listening list (story 15.4): recordings the class's learners chose to share,
 * newest first, with a short comment the learner sees. Playing one marks it as heard.
 */
import { useCallback, useEffect, useState } from 'react';
import { ArabicText } from '@/components';
import type { ClassSharedRecording, SharingApi } from '@/services/sharing/sharingApi';

const when = (iso: string) =>
  new Date(iso).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' });

export function SharedRecordingsList({
  api,
  classId,
}: {
  api: SharingApi;
  classId: string;
}) {
  const [items, setItems] = useState<ClassSharedRecording[] | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    const result = await api.forClass(classId);
    if (result.ok) setItems(result.value.items);
    else setMessage(result.message);
  }, [api, classId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!items) return <p className="muted">{message ?? 'Lade Hörliste …'}</p>;
  const open = items.filter((i) => !i.heardAt).length;

  return (
    <section className="stack" aria-labelledby="shared-title">
      <h2 id="shared-title" className="eyebrow">
        Hörliste {open > 0 && <span className="muted">· {open} neu</span>}
      </h2>
      {items.length === 0 && (
        <p className="muted">
          Noch nichts geteilt. Lernende teilen ihre Aufnahmen beim Sprechen (Shadowing)
          mit dir – nur du als Lehrkraft der Klasse hörst sie.
        </p>
      )}
      {items.map((item) => (
        <SharedItem
          key={item.id}
          item={item}
          onReview={async (change) => {
            const result = await api.review(classId, item.id, change);
            if (!result.ok) {
              setMessage(result.message);
              return false;
            }
            setMessage(null);
            await load();
            return true;
          }}
        />
      ))}
      {message && <p className="feedback-bad">{message}</p>}
    </section>
  );
}

function SharedItem({
  item,
  onReview,
}: {
  item: ClassSharedRecording;
  onReview(change: { comment?: string | null; heard?: boolean }): Promise<boolean>;
}) {
  const [comment, setComment] = useState(item.comment ?? '');
  const [busy, setBusy] = useState(false);
  const learner = item.learner.name ?? item.learner.email ?? 'Lernende:r';
  const save = async (change: { comment?: string | null; heard?: boolean }) => {
    setBusy(true);
    try {
      await onReview(change);
    } finally {
      setBusy(false);
    }
  };

  return (
    <article
      className={`card stack shared-item${item.heardAt ? '' : ' shared-item-new'}`}
      aria-label={`Aufnahme von ${learner}`}
    >
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <strong>{learner}</strong>
        <span className="muted" style={{ fontSize: '0.85rem' }}>
          {when(item.createdAt)}
          {item.score !== null && ` · ${Math.round(item.score * 100)} % erkannt`}
          {item.heardAt ? ' · gehört' : ' · neu'}
        </span>
      </div>
      <ArabicText>{item.text}</ArabicText>
      <audio
        controls
        preload="none"
        src={item.url}
        onPlay={() => {
          if (!item.heardAt) void onReview({ heard: true });
        }}
      />
      <label className="stack" style={{ gap: '0.25rem' }}>
        <span className="muted" style={{ fontSize: '0.85rem' }}>
          Kurzer Kommentar (sieht nur {learner})
        </span>
        <textarea
          rows={2}
          maxLength={500}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
        />
      </label>
      <div className="row">
        <button
          className="btn btn-primary"
          disabled={busy || comment.trim() === (item.comment ?? '')}
          onClick={() => void save({ comment: comment.trim() || null, heard: true })}
        >
          Kommentar speichern
        </button>
        {item.heardAt && (
          <button
            className="btn"
            disabled={busy}
            onClick={() => void save({ heard: false })}
          >
            Als neu markieren
          </button>
        )}
      </div>
    </article>
  );
}
