/**
 * The feedback button while Suffa is being tested (staging): always at hand in the corner,
 * it opens a small form for a bug, an idea, something unclear or praise. The page the tester
 * is on goes along, so the team sees where it happened. Shown only when the server says so
 * (`/api/client-config` → feedback).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';
import { loadClientConfig } from '@/services/clientConfig';
import {
  FEEDBACK_KINDS,
  FeedbackApi,
  type FeedbackKind,
} from '@/services/feedback/feedbackApi';

/** How often a failed client-config request is retried (after 2 s, 4 s, 8 s). */
const CONFIG_RETRIES = 3;

export function FeedbackButton({ api }: { api?: FeedbackApi }) {
  const { t } = useTranslation('feedback');
  const client = useMemo(() => api ?? new FeedbackApi(), [api]);
  const [enabled, setEnabled] = useState(false);
  const [open, setOpen] = useState(false);
  // Focus goes into the form when it opens and back to the button when it closes.
  const trigger = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);
  useEffect(() => {
    if (!open && wasOpen.current) trigger.current?.focus();
    wasOpen.current = open;
  }, [open]);

  useEffect(() => {
    let alive = true;
    let retry: number | undefined;
    // A failed request (offline, server restarting) is tried again a few times; a server
    // that answers "feedback: false" is final.
    const load = (attempt: number) => {
      loadClientConfig().then(
        (config) => alive && setEnabled(config.feedback),
        () => {
          if (!alive) return;
          setEnabled(false);
          if (attempt < CONFIG_RETRIES) {
            retry = window.setTimeout(() => load(attempt + 1), 2000 * 2 ** attempt);
          }
        }
      );
    };
    load(0);
    return () => {
      alive = false;
      window.clearTimeout(retry);
    };
  }, []);

  if (!enabled) return null;
  return (
    <>
      {!open && (
        <button
          ref={trigger}
          type="button"
          className="btn feedback-fab"
          onClick={() => setOpen(true)}
          aria-haspopup="dialog"
        >
          {t('button')}
        </button>
      )}
      {open && <FeedbackForm api={client} onClose={() => setOpen(false)} />}
    </>
  );
}

function FeedbackForm({ api, onClose }: { api: FeedbackApi; onClose: () => void }) {
  const { t } = useTranslation(['feedback', 'common']);
  const { pathname, search } = useLocation();
  const [kind, setKind] = useState<FeedbackKind>('confusing');
  const [message, setMessage] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [error, setError] = useState<string | null>(null);
  const field = useRef<HTMLTextAreaElement>(null);
  useEffect(() => field.current?.focus(), []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) return;
    setState('sending');
    const result = await api.send({
      kind,
      message: message.trim(),
      page: reportedPage(pathname, search),
    });
    if (result.ok) {
      setState('sent');
      setMessage('');
    } else {
      setState('idle');
      setError(result.message);
    }
  };

  return (
    <div
      className="card stack feedback-panel"
      role="dialog"
      aria-labelledby="feedback-title"
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose();
      }}
    >
      <div className="collapsible-head">
        <h2 id="feedback-title" className="eyebrow" style={{ margin: 0 }}>
          {t('title')}
        </h2>
        <button
          type="button"
          className="btn"
          onClick={onClose}
          aria-label={t('common:close')}
        >
          ✕
        </button>
      </div>
      {state === 'sent' ? (
        <div className="stack">
          <p className="feedback-good" style={{ margin: 0 }}>
            {t('thanks')}
          </p>
          <div className="row">
            <button type="button" className="btn" onClick={() => setState('idle')}>
              {t('another')}
            </button>
            <button type="button" className="btn btn-primary" onClick={onClose}>
              {t('done')}
            </button>
          </div>
        </div>
      ) : (
        <form className="stack" onSubmit={(e) => void submit(e)} aria-label={t('form')}>
          <div className="segmented" role="group" aria-label={t('kind')}>
            {FEEDBACK_KINDS.map((k) => (
              <button
                key={k}
                type="button"
                className={`btn segmented-item${kind === k ? ' btn-primary' : ''}`}
                aria-pressed={kind === k}
                onClick={() => setKind(k)}
              >
                {t(`kinds.${k}`)}
              </button>
            ))}
          </div>
          <textarea
            ref={field}
            className="input"
            rows={4}
            maxLength={4000}
            aria-label={t('message')}
            placeholder={t('placeholder')}
            value={message}
            onChange={(e) => {
              setMessage(e.target.value);
              setError(null);
            }}
          />
          <p className="muted" style={{ margin: 0, fontSize: '0.85rem' }}>
            {t('stored', { page: reportedPage(pathname, search) })}
          </p>
          {error && <span className="feedback-bad">{error}</span>}
          <button
            type="submit"
            className="btn btn-primary"
            disabled={!message.trim() || state === 'sending'}
          >
            {state === 'sending' ? t('sending') : t('send')}
          </button>
        </form>
      )}
    </div>
  );
}

/**
 * The page sent with a report, without secrets: an invite link carries its token in the path,
 * a sign-in link its code in the query, so both are cut off.
 */
export function reportedPage(pathname: string, search: string): string {
  if (/^\/join\//.test(pathname)) return '/join/…';
  return /^\/login(\/|$)/.test(pathname) ? pathname : pathname + search;
}
