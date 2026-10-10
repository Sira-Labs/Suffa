/**
 * AI suggestions for a recording (story 11.4): the teacher asks for chapters, checkpoints and
 * transcript corrections made from the transcript, then accepts or dismisses each one. Nothing reaches learners
 * without the teacher's click.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArabicText, CollapsibleCard } from '@/components';
import { clock } from '@/services/media/checkpoints';
import type {
  InteractiveApi,
  Suggestion,
  SuggestionState,
} from '@/services/media/interactiveApi';

const POLL_MS = 3000;

function Describe({ s }: { s: Suggestion }) {
  const { t } = useTranslation('recordings');
  if (s.kind === 'chapter') {
    return (
      <span>
        {t('suggestions.chapter')} {s.data.title}
      </span>
    );
  }
  if (s.kind === 'fix') {
    return (
      <span>
        {t('suggestions.fix')} <del className="muted">{s.data.before}</del> →{' '}
        <ArabicText>{s.data.after}</ArabicText>
      </span>
    );
  }
  const d = s.data;
  switch (d.kind) {
    case 'mcq':
      return (
        <span>
          {t('suggestions.mcq')} {d.question}{' '}
          <span className="muted">({d.options[d.answer]})</span>
        </span>
      );
    case 'dictation':
      return (
        <span>
          {t('suggestions.dictation')} <ArabicText>{d.answer}</ArabicText>
        </span>
      );
    case 'vocab_flash':
      return (
        <span>
          {t('suggestions.word')} <ArabicText>{d.ar}</ArabicText> – {d.de}
          {d.contentRef ? (
            <span className="muted"> {t('suggestions.courseWord')}</span>
          ) : null}
        </span>
      );
  }
}

export function SuggestionsEditor({
  api,
  classId,
  mediaId,
  onChange,
  pollMs = POLL_MS,
}: {
  api: InteractiveApi;
  classId: string;
  mediaId: string;
  onChange: () => void;
  pollMs?: number;
}) {
  const { t } = useTranslation('recordings');
  const [state, setState] = useState<SuggestionState | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  // One decision (or batch) at a time: repeated clicks must not send the same one twice.
  const [busy, setBusy] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    const result = await api.suggestions(classId, mediaId);
    if (!result.ok) return setMessage(result.message);
    setState(result.value);
    const status = result.value.run?.status;
    if (status === 'queued' || status === 'running') {
      timer.current = setTimeout(() => void load(), pollMs);
    }
  }, [api, classId, mediaId, pollMs]);

  useEffect(() => {
    void load();
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [load]);

  const request = async () => {
    setMessage(null);
    const result = await api.requestSuggestions(classId, mediaId);
    if (!result.ok) return setMessage(result.message);
    await load();
  };

  const decide = async (s: Suggestion, decision: 'accept' | 'dismiss') => {
    if (busy) return;
    setBusy(true);
    const result = await api
      .decide(classId, mediaId, s.id, decision)
      .finally(() => setBusy(false));
    if (!result.ok) return setMessage(result.message);
    setState((current) =>
      current
        ? { ...current, suggestions: current.suggestions.filter((x) => x.id !== s.id) }
        : current
    );
    if (decision === 'accept') onChange();
  };

  // All at once, one after another (each is its own decision on the server).
  const decideAll = async (decision: 'accept' | 'dismiss') => {
    if (busy) return;
    setBusy(true);
    try {
      await decideEach(decision);
    } finally {
      setBusy(false);
    }
  };
  const decideEach = async (decision: 'accept' | 'dismiss') => {
    for (const s of state?.suggestions ?? []) {
      const result = await api.decide(classId, mediaId, s.id, decision);
      if (!result.ok) {
        setMessage(result.message);
        break;
      }
      setState((current) =>
        current
          ? { ...current, suggestions: current.suggestions.filter((x) => x.id !== s.id) }
          : current
      );
    }
    if (decision === 'accept') onChange();
  };

  const status = state?.run?.status;
  const working = status === 'queued' || status === 'running';
  return (
    <CollapsibleCard
      id="suggestions"
      title={
        state?.suggestions.length
          ? t('suggestions.titleOpen', { count: state.suggestions.length })
          : t('suggestions.title')
      }
    >
      <p className="muted" style={{ margin: 0 }}>
        {t('suggestions.intro')}
      </p>
      <div className="row" style={{ gap: '0.5rem', flexWrap: 'wrap' }}>
        <button
          className="btn"
          type="button"
          disabled={working}
          onClick={() => void request()}
        >
          {working
            ? t('suggestions.working')
            : state?.suggestions.length
              ? t('suggestions.again')
              : t('suggestions.fetch')}
        </button>
        {status === 'failed' && (
          <span className="feedback-bad">{t('suggestions.failed')}</span>
        )}
        {message && <span className="feedback-bad">{message}</span>}
      </div>
      {(state?.suggestions.length ?? 0) > 1 && (
        <div className="row" style={{ gap: '0.5rem', flexWrap: 'wrap' }}>
          <button
            className="btn btn-primary"
            type="button"
            disabled={busy}
            onClick={() => void decideAll('accept')}
          >
            {t('suggestions.acceptAll')}
          </button>
          <button
            className="btn"
            type="button"
            disabled={busy}
            onClick={() => void decideAll('dismiss')}
          >
            {t('suggestions.dismissAll')}
          </button>
        </div>
      )}
      {state?.suggestions.map((s) => (
        <div
          key={s.id}
          className="row"
          style={{ gap: '0.5rem', justifyContent: 'space-between', flexWrap: 'wrap' }}
        >
          <span>
            <span className="muted">{clock(s.atSec)}</span> <Describe s={s} />
          </span>
          <span className="row" style={{ gap: '0.4rem' }}>
            <button
              className="btn btn-primary"
              type="button"
              disabled={busy}
              aria-label={t('suggestions.acceptAt', { time: clock(s.atSec) })}
              onClick={() => void decide(s, 'accept')}
            >
              {t('suggestions.accept')}
            </button>
            <button
              className="btn"
              type="button"
              disabled={busy}
              aria-label={t('suggestions.dismissAt', { time: clock(s.atSec) })}
              onClick={() => void decide(s, 'dismiss')}
            >
              {t('suggestions.dismiss')}
            </button>
          </span>
        </div>
      ))}
    </CollapsibleCard>
  );
}
