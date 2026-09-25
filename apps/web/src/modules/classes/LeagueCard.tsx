/**
 * Weekly league (story 14.2): opt-in on both sides. The teacher switches it on (and marks a
 * class of minors); each learner decides whether to take part. Ranked by the share of the
 * learner's own weekly goal, so beginners can win; only the top three are named and nobody
 * is ever shown as last.
 */
import { useCallback, useEffect, useState } from 'react';
import type { ClassesApi, LeagueView } from '@/services/classes/classesApi';

const MEDAL = ['🥇', '🥈', '🥉'];

export function LeagueCard({
  api,
  classId,
  teacher,
}: {
  api: ClassesApi;
  classId: string;
  teacher: boolean;
}) {
  const [view, setView] = useState<LeagueView | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const result = await api.league(classId);
    if (result.ok) setView(result.value);
    else setMessage(result.message);
  }, [api, classId]);

  useEffect(() => {
    void load();
  }, [load]);

  const act = async (action: () => Promise<{ ok: boolean; message?: string }>) => {
    setBusy(true);
    try {
      const result = await action();
      setMessage(result.ok ? null : (result.message ?? null));
      await load();
    } finally {
      setBusy(false);
    }
  };

  if (!view) return message ? <p className="feedback-bad">{message}</p> : null;
  // Learners do not see a league that is switched off.
  if (!teacher && !view.enabled) return null;

  return (
    <section className="card stack" aria-labelledby="league-title">
      <h2 id="league-title" className="eyebrow">
        Wochenliga
      </h2>
      {teacher && (
        <div className="stack" style={{ gap: '0.5rem' }}>
          <label className="row" style={{ justifyContent: 'space-between' }}>
            <span className="stack" style={{ gap: 0 }}>
              <span>Liga einschalten</span>
              <span className="muted" style={{ fontSize: '0.85rem' }}>
                Wertung nach Anteil am eigenen Wochenziel; nur wer mitmachen will, wird
                gezeigt.
              </span>
            </span>
            <input
              type="checkbox"
              checked={view.enabled}
              disabled={busy}
              onChange={(e) =>
                void act(() =>
                  api.saveLeagueSettings(classId, {
                    enabled: e.target.checked,
                    minors: view.minors,
                  })
                )
              }
            />
          </label>
          <label className="row" style={{ justifyContent: 'space-between' }}>
            <span className="stack" style={{ gap: 0 }}>
              <span>Klasse mit Minderjährigen</span>
              <span className="muted" style={{ fontSize: '0.85rem' }}>
                Nur Vornamen; beim Markieren wird die Liga ausgeschaltet.
              </span>
            </span>
            <input
              type="checkbox"
              checked={view.minors}
              disabled={busy}
              onChange={(e) =>
                void act(() =>
                  api.saveLeagueSettings(classId, {
                    // Marking a class of minors switches the league off; it can be
                    // turned on again deliberately.
                    enabled: e.target.checked ? false : view.enabled,
                    minors: e.target.checked,
                  })
                )
              }
            />
          </label>
        </div>
      )}

      {view.enabled && view.optedIn !== null && (
        <label className="row" style={{ justifyContent: 'space-between' }}>
          <span>Ich mache mit</span>
          <input
            type="checkbox"
            checked={view.optedIn}
            disabled={busy}
            onChange={(e) =>
              void act(() => api.setLeagueOptIn(classId, e.target.checked))
            }
          />
        </label>
      )}

      {view.enabled &&
        (view.podium.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>
            {view.participants === 0
              ? 'Noch niemand macht mit.'
              : 'Diese Woche ist noch offen – der erste Lerntag bringt aufs Podest.'}
          </p>
        ) : (
          <ol className="feed-list" aria-label="Podest dieser Woche">
            {view.podium.map((p) => (
              <li
                key={`${p.place}-${p.name}`}
                className={`feed-item row${p.you ? ' feed-item-you' : ''}`}
                style={{ justifyContent: 'space-between' }}
              >
                <span>
                  {MEDAL[p.place - 1]} <strong>{p.you ? 'Du' : p.name}</strong>{' '}
                  <span className="muted">· {p.title}</span>
                </span>
                <span>{p.percent} %</span>
              </li>
            ))}
          </ol>
        ))}

      {view.you && !view.you.onPodium && (
        <p className="muted" style={{ margin: 0 }}>
          Deine Woche: {view.you.activeDays} von {view.you.goal} Tagen ({view.you.percent}{' '}
          %). Jeder Lerntag zählt – die Liga beginnt jeden Montag neu.
        </p>
      )}
      {message && <p className="feedback-bad">{message}</p>}
    </section>
  );
}
