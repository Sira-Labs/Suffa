/**
 * The feedback button while Suffa is being tested (staging): always at hand in the corner,
 * it opens a small form for a bug, an idea, something unclear or praise. The page the tester
 * is on goes along, so the team sees where it happened. Shown only when the server says so
 * (`/api/client-config` → feedback).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { loadClientConfig } from '@/services/clientConfig';
import {
  FEEDBACK_KIND_LABEL,
  FEEDBACK_KINDS,
  FeedbackApi,
  type FeedbackKind,
} from '@/services/feedback/feedbackApi';

export function FeedbackButton({ api }: { api?: FeedbackApi }) {
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
    loadClientConfig().then(
      (config) => alive && setEnabled(config.feedback),
      // Offline or no backend: no button, nothing could be sent anyway.
      () => alive && setEnabled(false)
    );
    return () => {
      alive = false;
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
          Feedback
        </button>
      )}
      {open && <FeedbackForm api={client} onClose={() => setOpen(false)} />}
    </>
  );
}

function FeedbackForm({ api, onClose }: { api: FeedbackApi; onClose: () => void }) {
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
      page: pathname + search,
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
          Feedback zu dieser Seite
        </h2>
        <button type="button" className="btn" onClick={onClose} aria-label="Schließen">
          ✕
        </button>
      </div>
      {state === 'sent' ? (
        <div className="stack">
          <p className="feedback-good" style={{ margin: 0 }}>
            Danke! Deine Rückmeldung ist angekommen.
          </p>
          <div className="row">
            <button type="button" className="btn" onClick={() => setState('idle')}>
              Noch etwas melden
            </button>
            <button type="button" className="btn btn-primary" onClick={onClose}>
              Fertig
            </button>
          </div>
        </div>
      ) : (
        <form
          className="stack"
          onSubmit={(e) => void submit(e)}
          aria-label="Feedback senden"
        >
          <div className="segmented" role="group" aria-label="Art der Rückmeldung">
            {FEEDBACK_KINDS.map((k) => (
              <button
                key={k}
                type="button"
                className={`btn segmented-item${kind === k ? ' btn-primary' : ''}`}
                aria-pressed={kind === k}
                onClick={() => setKind(k)}
              >
                {FEEDBACK_KIND_LABEL[k]}
              </button>
            ))}
          </div>
          <textarea
            ref={field}
            className="input"
            rows={4}
            maxLength={4000}
            aria-label="Deine Rückmeldung"
            placeholder="Was ist dir aufgefallen? Was hast du gesucht?"
            value={message}
            onChange={(e) => {
              setMessage(e.target.value);
              setError(null);
            }}
          />
          <p className="muted" style={{ margin: 0, fontSize: '0.85rem' }}>
            Gespeichert wird dein Text, diese Seite ({pathname}) und – wenn du angemeldet
            bist – dein Konto, damit wir nachfragen können.
          </p>
          {error && <span className="feedback-bad">{error}</span>}
          <button
            type="submit"
            className="btn btn-primary"
            disabled={!message.trim() || state === 'sending'}
          >
            {state === 'sending' ? 'Wird gesendet …' : 'Senden'}
          </button>
        </form>
      )}
    </div>
  );
}
