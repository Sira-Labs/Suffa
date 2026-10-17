/**
 * Live lessons on the class page (ADR-0026): the teacher plans, starts, ends and cancels
 * sessions and invites to one by link or QR code; learners see a banner while one is live,
 * else the next planned one.
 */
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import QRCode from 'qrcode';
import {
  LiveApi,
  type LiveAudience,
  type LiveSession,
  type LiveSessions,
} from '@/services/live/liveApi';

export const DEFAULT_MINUTES = 60;

/** The next full hour, as a value for <input type="datetime-local">. */
export function nextHourLocal(now = new Date()): string {
  const d = new Date(now);
  d.setMinutes(0, 0, 0);
  d.setHours(d.getHours() + 1);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}

function useWhen() {
  const { t, i18n } = useTranslation('live');
  return (session: LiveSession) =>
    t('session.when', {
      date: new Date(session.startsAt).toLocaleString(i18n.language, {
        dateStyle: 'medium',
        timeStyle: 'short',
      }),
      minutes: session.durationMinutes,
    });
}

function useSessions(api: LiveApi, classId: string) {
  const [data, setData] = useState<LiveSessions | null | undefined>(undefined);
  const load = useCallback(async () => {
    const result = await api.list(classId);
    setData(result.ok ? result.value : null);
  }, [api, classId]);
  useEffect(() => {
    void load();
  }, [load]);
  return { data, load };
}

const roomPath = (classId: string, sessionId: string) =>
  `/classes/${classId}/live/${sessionId}`;

const AUDIENCES: LiveAudience[] = ['all', 'sisters', 'brothers'];

interface ShownInvite {
  url: string;
  expiresAt: string;
  /** The QR code as a data URL, made in the browser. */
  qr: string;
}

/** The invite link of one session: its QR code, the link to copy or share, how long it holds. */
function InvitePanel({ session, invite }: { session: LiveSession; invite: ShownInvite }) {
  const { t, i18n } = useTranslation('live');
  const [copied, setCopied] = useState(false);
  const canShare = typeof navigator.share === 'function';
  return (
    <div className="stack live-invite" style={{ alignItems: 'flex-start' }}>
      <img
        src={invite.qr}
        alt={t('invite.qrAlt', { title: session.title })}
        width={200}
        height={200}
      />
      <span style={{ wordBreak: 'break-all' }}>
        <code>{invite.url}</code>
      </span>
      <span className="row" style={{ gap: '0.5rem' }}>
        <button
          className="btn"
          onClick={async () => {
            await navigator.clipboard?.writeText(invite.url);
            setCopied(true);
          }}
        >
          {copied ? t('invite.copied') : t('invite.copy')}
        </button>
        {canShare && (
          <button
            className="btn"
            onClick={() =>
              void navigator
                .share({ title: session.title, url: invite.url })
                .catch(() => {
                  // Closed without sharing.
                })
            }
          >
            {t('invite.share')}
          </button>
        )}
      </span>
      <span className="muted" style={{ fontSize: '0.85rem' }}>
        {t('invite.validUntil', {
          date: new Date(invite.expiresAt).toLocaleString(i18n.language, {
            dateStyle: 'medium',
            timeStyle: 'short',
          }),
        })}
      </span>
      <span className="muted" style={{ fontSize: '0.85rem' }}>
        {t('invite.note')}
      </span>
    </div>
  );
}

/** Who a session is for and whether learners' cameras stay off; nothing for a plain one. */
export function SessionTags({ session }: { session: LiveSession }) {
  const { t } = useTranslation('live');
  const tags = [
    session.audience !== 'all' && t(`audience.${session.audience}`),
    session.recording && t('session.recording'),
    !session.learnerCameras && t('session.camerasOff'),
  ].filter(Boolean);
  if (tags.length === 0) return null;
  return (
    <span className="row" style={{ gap: '0.35rem', flexWrap: 'wrap' }}>
      {tags.map((tag) => (
        <span key={String(tag)} className="badge">
          {tag}
        </span>
      ))}
    </span>
  );
}

/** The teacher's tab: plan and run the class's live lessons. */
export function LiveSessionsTeacher({
  classId,
  api: given,
}: {
  classId: string;
  api?: LiveApi;
}) {
  const { t } = useTranslation('live');
  const api = useMemo(() => given ?? new LiveApi(), [given]);
  const navigate = useNavigate();
  const when = useWhen();
  const { data, load } = useSessions(api, classId);
  const [title, setTitle] = useState('');
  const [startsAt, setStartsAt] = useState(() => nextHourLocal());
  const [minutes, setMinutes] = useState(DEFAULT_MINUTES);
  const [audience, setAudience] = useState<LiveAudience>('all');
  const [camerasOff, setCamerasOff] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [invites, setInvites] = useState<Record<string, ShownInvite>>({});
  // Sessions whose link is being made: a second click would replace the first link.
  const [inviting, setInviting] = useState<ReadonlySet<string>>(new Set());

  const toggleInvite = async (session: LiveSession) => {
    if (invites[session.id]) {
      setInvites(({ [session.id]: _hidden, ...rest }) => rest);
      return;
    }
    if (inviting.has(session.id)) return;
    setInviting((busy) => new Set(busy).add(session.id));
    setError(null);
    try {
      const result = await api.invite(classId, session.id);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      const qr = await QRCode.toDataURL(result.value.url, { margin: 1, width: 200 });
      setInvites((shown) => ({ ...shown, [session.id]: { ...result.value, qr } }));
    } finally {
      setInviting((busy) => {
        const next = new Set(busy);
        next.delete(session.id);
        return next;
      });
    }
  };

  const run = async (action: () => Promise<{ ok: boolean; message?: string }>) => {
    setBusy(true);
    setError(null);
    const result = await action();
    setBusy(false);
    if (!result.ok) setError(result.message ?? null);
    await load();
    return result.ok;
  };

  const plan = async (event: FormEvent) => {
    event.preventDefault();
    const ok = await run(() =>
      api.create(classId, {
        title: title.trim(),
        startsAt: new Date(startsAt).toISOString(),
        durationMinutes: minutes,
        audience,
        learnerCameras: !camerasOff,
      })
    );
    if (ok) setTitle('');
  };

  if (data === undefined) return <p className="muted">{t('loading')}</p>;

  return (
    <div className="stack" style={{ gap: '1rem' }}>
      {data && !data.enabled && (
        <p className="card muted" role="note">
          {t('notSetUp')}
        </p>
      )}
      <section className="stack" aria-labelledby="live-sessions">
        <h2 id="live-sessions" className="eyebrow">
          {t('title')}
        </h2>
        {!data || data.sessions.length === 0 ? (
          <p className="muted">{t('none')}</p>
        ) : (
          <ul className="stack live-sessions" style={{ listStyle: 'none', padding: 0 }}>
            {data.sessions.map((s) => (
              <li key={s.id} className="card stack live-session-item">
                <div className="row live-session">
                  <span className="stack" style={{ gap: 0 }}>
                    <strong>{s.title}</strong>
                    <span className="muted" style={{ fontSize: '0.85rem' }}>
                      {s.status === 'live' ? t('session.live') : when(s)}
                    </span>
                    <SessionTags session={s} />
                  </span>
                  <span className="row" style={{ gap: '0.5rem' }}>
                    {s.status === 'live' ? (
                      <>
                        <Link
                          className="btn btn-primary"
                          to={roomPath(classId, s.id)}
                          state={{ teacher: true }}
                        >
                          {t('session.join')}
                        </Link>
                        <button
                          className="btn"
                          disabled={busy}
                          onClick={() => void run(() => api.end(classId, s.id))}
                        >
                          {t('session.end')}
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          className="btn btn-primary"
                          disabled={busy || !data.enabled}
                          onClick={async () => {
                            if (await run(() => api.start(classId, s.id))) {
                              navigate(roomPath(classId, s.id), {
                                state: { teacher: true },
                              });
                            }
                          }}
                        >
                          {t('session.start')}
                        </button>
                        <button
                          className="btn"
                          disabled={busy}
                          onClick={() => {
                            if (
                              window.confirm(
                                t('session.confirmCancel', { title: s.title })
                              )
                            ) {
                              void run(() => api.cancel(classId, s.id));
                            }
                          }}
                        >
                          {t('session.cancel')}
                        </button>
                      </>
                    )}
                    <button
                      className="btn"
                      disabled={inviting.has(s.id)}
                      aria-expanded={Boolean(invites[s.id])}
                      onClick={() => void toggleInvite(s)}
                    >
                      {invites[s.id] ? t('session.hideInvite') : t('session.invite')}
                    </button>
                  </span>
                </div>
                {invites[s.id] && <InvitePanel session={s} invite={invites[s.id]!} />}
              </li>
            ))}
          </ul>
        )}
      </section>
      <form className="card stack" onSubmit={plan} aria-labelledby="live-plan">
        <h3 id="live-plan">{t('plan.heading')}</h3>
        <label className="stack" style={{ gap: '0.25rem' }}>
          <span>{t('plan.title')}</span>
          <input
            required
            maxLength={120}
            value={title}
            placeholder={t('plan.titlePlaceholder')}
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>
        <div className="row" style={{ gap: '1rem', flexWrap: 'wrap' }}>
          <label className="stack" style={{ gap: '0.25rem' }}>
            <span>{t('plan.startsAt')}</span>
            <input
              type="datetime-local"
              required
              value={startsAt}
              onChange={(e) => setStartsAt(e.target.value)}
            />
          </label>
          <label className="stack" style={{ gap: '0.25rem' }}>
            <span>{t('plan.duration')}</span>
            <input
              type="number"
              min={10}
              max={240}
              step={5}
              required
              value={minutes}
              onChange={(e) => setMinutes(Number(e.target.value))}
            />
          </label>
          <label className="stack" style={{ gap: '0.25rem' }}>
            <span>{t('plan.audience')}</span>
            <select
              value={audience}
              onChange={(e) => setAudience(e.target.value as LiveAudience)}
            >
              {AUDIENCES.map((a) => (
                <option key={a} value={a}>
                  {t(`audience.${a}`)}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="row" style={{ gap: '0.5rem' }}>
          <input
            type="checkbox"
            checked={camerasOff}
            onChange={(e) => setCamerasOff(e.target.checked)}
          />
          <span>{t('plan.camerasOff')}</span>
        </label>
        <p className="muted" style={{ fontSize: '0.85rem', margin: 0 }}>
          {t('plan.audienceHint')}
        </p>
        {error && (
          <p className="feedback-warn" role="alert">
            {error}
          </p>
        )}
        <button
          className="btn btn-primary"
          type="submit"
          disabled={busy || !title.trim()}
        >
          {t('plan.submit')}
        </button>
      </form>
    </div>
  );
}

/** The learner's banner: the live lesson to join, or when the next one starts. */
export function LiveBanner({ classId, api: given }: { classId: string; api?: LiveApi }) {
  const { t, i18n } = useTranslation('live');
  const api = useMemo(() => given ?? new LiveApi(), [given]);
  const { data } = useSessions(api, classId);
  if (!data?.enabled) return null;
  const live = data.sessions.find((s) => s.status === 'live');
  if (live) {
    return (
      <Link className="card row quiz-banner live-banner" to={roomPath(classId, live.id)}>
        <strong>{t('banner.live', { title: live.title })}</strong>
        <SessionTags session={live} />
        <span>{t('banner.join')}</span>
      </Link>
    );
  }
  const next = data.sessions.find((s) => s.status === 'scheduled');
  if (!next) return null;
  return (
    <p className="card muted">
      {t('banner.next', {
        title: next.title,
        date: new Date(next.startsAt).toLocaleString(i18n.language, {
          dateStyle: 'medium',
          timeStyle: 'short',
        }),
      })}
    </p>
  );
}
