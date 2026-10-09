/**
 * What the learner shared with the teacher of one class (story 15.4): play it again, read the
 * teacher's comment, withdraw it (the file is deleted).
 */
import { useCallback, useEffect, useState } from 'react';
import { ArabicText } from '@/components';
import type { SharedRecording, SharingApi } from '@/services/sharing/sharingApi';

const day = (iso: string) => new Date(iso).toLocaleDateString('de-DE');

export function MySharedRecordings({
  api,
  classId,
}: {
  api: SharingApi;
  classId: string;
}) {
  const [items, setItems] = useState<SharedRecording[] | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    const result = await api.mine();
    if (result.ok) setItems(result.value.items.filter((i) => i.classId === classId));
    else setMessage(result.message);
  }, [api, classId]);

  useEffect(() => {
    void load();
  }, [load]);

  const withdraw = async (item: SharedRecording) => {
    if (!window.confirm('Aufnahme zurückziehen? Sie wird gelöscht.')) return;
    const result = await api.withdraw(item.id);
    setMessage(result.ok ? null : result.message);
    await load();
  };

  if (!items) return message ? <p className="feedback-bad">{message}</p> : null;

  return (
    <section className="stack" aria-labelledby="my-shared-title">
      <h2 id="my-shared-title" className="eyebrow">
        Mit der Lehrkraft geteilt
      </h2>
      {items.length === 0 ? (
        <p className="muted">
          Beim Sprechen (Shadowing) kannst du eine Aufnahme mit deiner Lehrkraft teilen.
          Nur sie hört sie, und du kannst sie jederzeit zurückziehen.
        </p>
      ) : (
        items.map((item) => (
          <article key={item.id} className="card stack" aria-label="Geteilte Aufnahme">
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <span className="muted" style={{ fontSize: '0.85rem' }}>
                {day(item.createdAt)}
                {item.heardAt ? ' · von der Lehrkraft gehört' : ' · noch nicht gehört'}
              </span>
              <button className="btn" onClick={() => void withdraw(item)}>
                Zurückziehen
              </button>
            </div>
            <ArabicText>{item.text}</ArabicText>
            <audio controls preload="none" src={item.url} />
            {item.comment && (
              <p className="shared-comment" style={{ margin: 0 }}>
                <strong>Deine Lehrkraft:</strong> {item.comment}
              </p>
            )}
          </article>
        ))
      )}
      {message && <p className="feedback-bad">{message}</p>}
    </section>
  );
}
