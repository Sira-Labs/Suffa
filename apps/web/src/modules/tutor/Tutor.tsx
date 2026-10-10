/**
 * al-Muʿallim (story 10.3): chat with the AI teacher. Answers stream in; Arabic follows the
 * learner's tashkīl setting; each answer can be rated. Opened from a recording, the question
 * carries the moment ("ask about this minute"). Writing Arabic to the tutor counts for the
 * day's tutor quest.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router-dom';
import { dayKey } from '@suffa/engagement';
import { useLearnerTimeZone } from '@/modules/engagement/useEngagement';
import { ApiSyncProvider } from '@/services/sync/ApiSyncProvider';
import {
  countArabicLetters,
  TutorApi,
  type ConversationSummary,
  type TurnContext,
  type TutorLanguage,
} from '@/services/tutor/tutorApi';
import { usePracticeStore, useSyncStore } from '@/state';
import { GradePanel } from './GradePanel';
import { TutorText } from './TutorText';

interface ShownMessage {
  key: string;
  role: 'user' | 'assistant';
  content: string;
  id?: string;
  rating?: -1 | 1 | null;
  pending?: boolean;
  error?: boolean;
}

/** What the tutor is doing while a tool runs: `tutor:activity.<key>`. */
type Activity =
  | 'lookup_vocab'
  | 'get_root_family'
  | 'get_learner_state'
  | 'get_media_segment'
  | 'thinking';

const TOOLS: readonly string[] = [
  'lookup_vocab',
  'get_root_family',
  'get_learner_state',
  'get_media_segment',
];

const activityOf = (tool: string): Activity =>
  TOOLS.includes(tool) ? (tool as Activity) : 'thinking';

/** Starter questions: `tutor:suggestions.<key>`. */
const SUGGESTIONS = ['grammar', 'quiz', 'review', 'phrase'] as const;

const clock = (sec: number) =>
  `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;

export function Tutor({ api: injected }: { api?: TutorApi }) {
  const { t } = useTranslation('tutor');
  const api = useMemo(() => injected ?? new TutorApi(), [injected]);
  const provider = useSyncStore((s) => s.provider);
  const auth = useSyncStore((s) => s.auth);
  const signedIn = provider instanceof ApiSyncProvider && auth.status === 'signed-in';
  const [params] = useSearchParams();
  const context = useMemo<TurnContext | undefined>(() => {
    const mediaId = params.get('media');
    const unit = Number(params.get('unit'));
    if (mediaId) return { mediaId, atSec: Math.max(0, Number(params.get('t')) || 0) };
    return unit > 0 ? { unit } : undefined;
  }, [params]);

  const [available, setAvailable] = useState<boolean | null>(null);
  const [language, setLanguage] = useState<TutorLanguage>('de');
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ShownMessage[]>([]);
  const [draft, setDraft] = useState(() =>
    context?.mediaId ? t('mediaQuestion', { time: clock(context.atSec ?? 0) }) : ''
  );
  const [activity, setActivity] = useState<Activity | null>(null);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<'chat' | 'grade'>('chat');
  const abort = useRef<AbortController | null>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const practise = usePracticeStore((s) => s.practise);
  const timeZone = useLearnerTimeZone();

  const loadOverview = useCallback(async () => {
    const result = await api.overview();
    if (!result.ok) return setAvailable(false);
    setAvailable(result.value.available);
    setLanguage(result.value.tutorLanguage);
    setConversations(result.value.conversations);
  }, [api]);

  useEffect(() => {
    if (signedIn) void loadOverview();
  }, [signedIn, loadOverview]);

  useEffect(() => {
    bottom.current?.scrollIntoView?.({ block: 'end' });
  }, [messages, activity]);

  useEffect(() => () => abort.current?.abort(), []);

  const open = async (id: string) => {
    const result = await api.conversation(id);
    if (!result.ok) return;
    setConversationId(id);
    setMessages(
      result.value.messages.map((m) => ({
        key: m.id,
        id: m.role === 'assistant' ? m.id : undefined,
        role: m.role,
        content: m.content,
        rating: m.rating,
      }))
    );
  };

  const startNew = () => {
    abort.current?.abort();
    setConversationId(null);
    setMessages([]);
  };

  const update = (key: string, change: Partial<ShownMessage>) =>
    setMessages((all) => all.map((m) => (m.key === key ? { ...m, ...change } : m)));

  const send = async (text: string) => {
    const message = text.trim();
    if (!message || busy) return;
    setDraft('');
    setBusy(true);
    const answerKey = `a-${Date.now()}`;
    setMessages((all) => [
      ...all,
      { key: `u-${Date.now()}`, role: 'user', content: message },
      { key: answerKey, role: 'assistant', content: '', pending: true },
    ]);
    // Writing Arabic to the tutor is practice: once a day it counts for the tutor quest.
    if (countArabicLetters(message) >= 2) {
      void practise(0, 'tutor', `tutor/${dayKey(new Date(), timeZone)}`, []);
    }
    const controller = new AbortController();
    abort.current = controller;
    let content = '';
    for await (const event of api.turn(
      {
        ...(conversationId ? { conversationId } : {}),
        message,
        ...(context && !conversationId ? { context } : {}),
      },
      controller.signal
    )) {
      if (event.type === 'start') setConversationId(event.conversationId);
      else if (event.type === 'text') {
        content += event.text;
        setActivity(null);
        update(answerKey, { content });
      } else if (event.type === 'tool') setActivity(activityOf(event.name));
      else if (event.type === 'replace') {
        content = event.text;
        update(answerKey, { content });
      } else if (event.type === 'done')
        update(answerKey, { id: event.messageId, pending: false });
      else update(answerKey, { content: event.message, pending: false, error: true });
    }
    update(answerKey, { pending: false });
    setActivity(null);
    setBusy(false);
    void loadOverview();
  };

  const rate = async (m: ShownMessage, rating: -1 | 1) => {
    if (!m.id) return;
    const next = m.rating === rating ? null : rating;
    update(m.key, { rating: next });
    const result = await api.rate(m.id, next);
    if (!result.ok) update(m.key, { rating: m.rating ?? null });
  };

  const changeLanguage = async (value: TutorLanguage) => {
    setLanguage(value);
    await api.setLanguage(value);
  };

  if (!signedIn) {
    return (
      <div className="stack">
        <h1 translate="no">al-Muʿallim</h1>
        <p className="muted">
          <Trans
            t={t}
            i18nKey="signInNeeded"
            components={{ 1: <Link to="/settings" /> }}
          />
        </p>
      </div>
    );
  }

  return (
    <div className="stack tutor">
      <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <h1 style={{ margin: 0 }} translate="no">
          al-Muʿallim
        </h1>
        <label className="row muted" style={{ gap: '0.4rem' }}>
          {t('explainsIn')}
          <select
            className="input"
            value={language}
            onChange={(e) => void changeLanguage(e.target.value as TutorLanguage)}
            aria-label={t('explainLanguage')}
            style={{ width: 'auto' }}
          >
            <option value="de" lang="de">
              Deutsch
            </option>
            <option value="en" lang="en">
              English
            </option>
          </select>
        </label>
      </div>

      <div className="row" role="tablist" style={{ gap: '0.5rem' }}>
        <button
          role="tab"
          aria-selected={mode === 'chat'}
          className={`btn ${mode === 'chat' ? 'btn-primary' : ''}`}
          onClick={() => setMode('chat')}
        >
          {t('ask')}
        </button>
        <button
          role="tab"
          aria-selected={mode === 'grade'}
          className={`btn ${mode === 'grade' ? 'btn-primary' : ''}`}
          onClick={() => setMode('grade')}
        >
          {t('gradeTab')}
        </button>
      </div>

      {available === false && <p className="card muted">{t('unavailable')}</p>}

      {mode === 'grade' && <GradePanel api={api} disabled={available === false} />}

      {mode === 'chat' && conversations.length > 0 && (
        <details className="card">
          <summary>{t('earlier', { number: conversations.length })}</summary>
          <div className="stack" style={{ marginTop: '0.5rem' }}>
            <button className="btn" type="button" onClick={startNew}>
              {t('newConversation')}
            </button>
            {conversations.map((c) => (
              <button
                key={c.id}
                type="button"
                className={`btn tutor-conversation ${c.id === conversationId ? 'btn-primary' : ''}`}
                onClick={() => void open(c.id)}
                dir="auto"
              >
                {c.title || t('conversation')}
              </button>
            ))}
          </div>
        </details>
      )}

      {mode === 'chat' && context?.mediaId && !conversationId && (
        <p className="badge" style={{ alignSelf: 'flex-start' }}>
          {t('aboutRecording', { time: clock(context.atSec ?? 0) })}
        </p>
      )}

      {mode === 'chat' && (
        <>
          <div className="tutor-messages" aria-live="polite">
            {messages.length === 0 && (
              <div className="stack">
                <p className="muted" style={{ margin: 0 }}>
                  {t('empty')}
                </p>
                <div className="row" style={{ flexWrap: 'wrap', gap: '0.5rem' }}>
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      type="button"
                      className="btn"
                      disabled={available === false || busy}
                      onClick={() => void send(t(`suggestions.${s}`))}
                    >
                      {t(`suggestions.${s}`)}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {messages.map((m) => (
              <div
                key={m.key}
                className={`tutor-message tutor-${m.role}${m.error ? ' tutor-error' : ''}`}
              >
                {m.role === 'user' ? (
                  <p dir="auto" className="tutor-paragraph">
                    {m.content}
                  </p>
                ) : m.content ? (
                  <TutorText text={m.content} />
                ) : (
                  <span className="muted">
                    {activity ? t(`activity.${activity}`) : '…'}
                  </span>
                )}
                {m.role === 'assistant' && m.id && !m.pending && (
                  <div className="row tutor-rating">
                    <button
                      type="button"
                      className={`btn ${m.rating === 1 ? 'btn-primary' : ''}`}
                      aria-pressed={m.rating === 1}
                      aria-label={t('helpful')}
                      onClick={() => void rate(m, 1)}
                    >
                      👍
                    </button>
                    <button
                      type="button"
                      className={`btn ${m.rating === -1 ? 'btn-primary' : ''}`}
                      aria-pressed={m.rating === -1}
                      aria-label={t('notHelpful')}
                      onClick={() => void rate(m, -1)}
                    >
                      👎
                    </button>
                  </div>
                )}
              </div>
            ))}
            {activity && messages.at(-1)?.content && (
              <span className="muted">{t(`activity.${activity}`)}</span>
            )}
            <div ref={bottom} />
          </div>

          <form
            className="tutor-composer"
            onSubmit={(e) => {
              e.preventDefault();
              void send(draft);
            }}
          >
            <textarea
              className="input"
              dir="auto"
              rows={2}
              maxLength={2000}
              placeholder={t('placeholder')}
              aria-label={t('message')}
              value={draft}
              disabled={available === false}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void send(draft);
                }
              }}
            />
            {busy ? (
              <button
                className="btn"
                type="button"
                onClick={() => abort.current?.abort()}
              >
                {t('stop')}
              </button>
            ) : (
              <button
                className="btn btn-primary"
                type="submit"
                disabled={!draft.trim() || available === false}
              >
                {t('send')}
              </button>
            )}
          </form>
        </>
      )}
    </div>
  );
}
