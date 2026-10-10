/**
 * The admins' feedback inbox: testers' reports, newest first, with the page, the sender (when
 * signed in) and the app version. "Erledigt" files a report away; open ones are counted.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { dateLocale } from '@/i18n/format';
import {
  FeedbackApi,
  feedbackKindLabel,
  type FeedbackItem,
} from '@/services/feedback/feedbackApi';

export function FeedbackAdmin({ api }: { api?: FeedbackApi }) {
  const { t } = useTranslation('admin');
  const client = useMemo(() => api ?? new FeedbackApi(), [api]);
  const [items, setItems] = useState<FeedbackItem[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [open, setOpen] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  // Requests in flight: a second click must not repeat them (same cursor, same toggle).
  const [loading, setLoading] = useState(false);
  const [pending, setPending] = useState<ReadonlySet<string>>(new Set());

  const load = useCallback(
    async (before: string | null) => {
      setLoading(true);
      const result = await client.list(before).finally(() => setLoading(false));
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
    if (pending.has(item.id)) return;
    const status = item.status === 'new' ? 'done' : 'new';
    setPending((current) => new Set(current).add(item.id));
    const result = await client.setStatus(item.id, status).finally(() =>
      setPending((current) => {
        const next = new Set(current);
        next.delete(item.id);
        return next;
      })
    );
    if (!result.ok) return setMessage(result.message);
    setItems((current) => current.map((i) => (i.id === item.id ? { ...i, status } : i)));
    setOpen((n) => n + (status === 'done' ? -1 : 1));
  };

  const when = new Intl.DateTimeFormat(dateLocale(), {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  return (
    <section className="stack" aria-label={t('feedback.region')}>
      <p className="muted" style={{ margin: 0 }}>
        {t('feedback.open', { count: open })}
      </p>
      {message && <span className="feedback-bad">{message}</span>}
      {items.length === 0 && !message && <p className="muted">{t('feedback.none')}</p>}
      <ul className="feed-list" aria-label={t('feedback.list')}>
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
              <span className="badge">{feedbackKindLabel(item.kind)}</span>
              <span className="muted" style={{ fontSize: '0.85rem' }}>
                {when.format(new Date(item.createdAt))}
              </span>
            </div>
            <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{item.message}</p>
            <p className="muted" style={{ margin: 0, fontSize: '0.85rem' }}>
              {t('feedback.page')} <Link to={item.page}>{item.page}</Link> ·{' '}
              {item.sender
                ? `${item.sender.name || item.sender.email || t('feedback.account')} (${item.sender.role})`
                : t('feedback.noAccount')}{' '}
              · {item.appVersion || t('feedback.unknownVersion')}
            </p>
            <button
              type="button"
              className="btn"
              disabled={pending.has(item.id)}
              onClick={() => void toggle(item)}
            >
              {item.status === 'new' ? t('feedback.done') : t('feedback.reopen')}
            </button>
          </li>
        ))}
      </ul>
      {next && (
        <button
          type="button"
          className="btn"
          disabled={loading}
          onClick={() => void load(next)}
        >
          {t('feedback.older')}
        </button>
      )}
    </section>
  );
}
