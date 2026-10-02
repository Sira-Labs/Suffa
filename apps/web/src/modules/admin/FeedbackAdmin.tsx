/**
 * The admins' feedback inbox: testers' reports, newest first, with the page, the sender (when
 * signed in) and the app version. "Erledigt" files a report away; open ones are counted.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  FEEDBACK_KIND_LABEL,
  FeedbackApi,
  type FeedbackItem,
} from '@/services/feedback/feedbackApi';

const WHEN = new Intl.DateTimeFormat('de-DE', {
  dateStyle: 'medium',
  timeStyle: 'short',
});

export function FeedbackAdmin({ api }: { api?: FeedbackApi }) {
  const client = useMemo(() => api ?? new FeedbackApi(), [api]);
  const [items, setItems] = useState<FeedbackItem[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [open, setOpen] = useState(0);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(
    async (before: string | null) => {
      const result = await client.list(before);
      if (!result.ok) return setMessage(result.message);
      setMessage(null);
      setItems((current) =>
        before ? [...current, ...result.value.items] : result.value.items
      );
      setNext(result.value.next);
      setOpen(result.value.open);
    },
    [client]
  );

  useEffect(() => {
    void load(null);
  }, [load]);

  const toggle = async (item: FeedbackItem) => {
    const status = item.status === 'new' ? 'done' : 'new';
    const result = await client.setStatus(item.id, status);
    if (!result.ok) return setMessage(result.message);
    setItems((current) => current.map((i) => (i.id === item.id ? { ...i, status } : i)));
    setOpen((n) => n + (status === 'done' ? -1 : 1));
  };

  return (
    <section className="stack" aria-label="Feedback">
      <p className="muted" style={{ margin: 0 }}>
        {open === 1 ? '1 offene Rückmeldung' : `${open} offene Rückmeldungen`}
      </p>
      {message && <span className="feedback-bad">{message}</span>}
      {items.length === 0 && !message && (
        <p className="muted">Noch keine Rückmeldungen.</p>
      )}
      <ul className="feed-list" aria-label="Rückmeldungen">
        {items.map((item) => (
          <li
            key={item.id}
            className="card stack"
            style={{ opacity: item.status === 'done' ? 0.6 : 1 }}
          >
            <div
              className="row"
              style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}
            >
              <span className="badge">{FEEDBACK_KIND_LABEL[item.kind]}</span>
              <span className="muted" style={{ fontSize: '0.85rem' }}>
                {WHEN.format(new Date(item.createdAt))}
              </span>
            </div>
            <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{item.message}</p>
            <p className="muted" style={{ margin: 0, fontSize: '0.85rem' }}>
              Seite <Link to={item.page}>{item.page}</Link> ·{' '}
              {item.sender
                ? `${item.sender.name || item.sender.email || 'Konto'} (${item.sender.role})`
                : 'ohne Konto'}{' '}
              · {item.appVersion || 'Version unbekannt'}
            </p>
            <button type="button" className="btn" onClick={() => void toggle(item)}>
              {item.status === 'new' ? 'Erledigt' : 'Wieder öffnen'}
            </button>
          </li>
        ))}
      </ul>
      {next && (
        <button type="button" className="btn" onClick={() => void load(next)}>
          Ältere laden
        </button>
      )}
    </section>
  );
}
