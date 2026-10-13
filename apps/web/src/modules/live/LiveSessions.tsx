/**
 * Live lessons on the class page (ADR-0026): the teacher plans, starts, ends and cancels
 * sessions; learners see a banner while one is live, else the next planned one.
 */
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { LiveApi, type LiveSession, type LiveSessions } from '@/services/live/liveApi';

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
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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
              <li key={s.id} className="card row live-session">
                <span className="stack" style={{ gap: 0 }}>
                  <strong>{s.title}</strong>
                  <span className="muted" style={{ fontSize: '0.85rem' }}>
                    {s.status === 'live' ? t('session.live') : when(s)}
                  </span>
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
                            window.confirm(t('session.confirmCancel', { title: s.title }))
                          ) {
                            void run(() => api.cancel(classId, s.id));
                          }
                        }}
                      >
                        {t('session.cancel')}
                      </button>
                    </>
                  )}
                </span>
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
        </div>
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
