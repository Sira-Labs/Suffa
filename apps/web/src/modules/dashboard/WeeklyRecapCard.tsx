/**
 * Weekly recap on "Heute" (story 6.4): shown from Sunday evening until the learner closes it
 * or a new week's recap arrives. Needs the server; offline it shows nothing.
 */
import { useEffect, useMemo, useState } from 'react';
import { addDays, BADGES, dayKey, weekStart } from '@suffa/engagement';
import {
  NotificationsApi,
  type WeeklyRecap,
} from '@/services/notifications/notificationsApi';
import { ApiSyncProvider } from '@/services/sync/ApiSyncProvider';
import { useSyncStore } from '@/state';
import { useLearnerTimeZone } from '@/modules/engagement/useEngagement';

const DISMISSED_KEY = 'suffa:recap-dismissed';

function dismissedWeek(): string | null {
  try {
    return localStorage.getItem(DISMISSED_KEY);
  } catch (error) {
    // Private mode or blocked storage: the card simply shows again.
    if (error instanceof DOMException) return null;
    throw error;
  }
}

/** A recap is current during its own week's Sunday and the following week. */
export function recapIsCurrent(recap: WeeklyRecap, today: string): boolean {
  const thisWeek = weekStart(today);
  return recap.weekStart === thisWeek || recap.weekStart === addDays(thisWeek, -7);
}

export function WeeklyRecapCard() {
  const provider = useSyncStore((s) => s.provider);
  const auth = useSyncStore((s) => s.auth);
  const timeZone = useLearnerTimeZone();
  const api = useMemo(() => new NotificationsApi(), []);
  const [recap, setRecap] = useState<WeeklyRecap | null>(null);
  const [dismissed, setDismissed] = useState(dismissedWeek);
  const online = provider instanceof ApiSyncProvider && auth.status === 'signed-in';

  useEffect(() => {
    if (!online) return;
    let cancelled = false;
    void api.latestRecap().then((result) => {
      if (!cancelled && result.ok) setRecap(result.value.recap);
    });
    return () => {
      cancelled = true;
    };
  }, [api, online]);

  if (!online || !recap || dismissed === recap.weekStart) return null;
  if (!recapIsCurrent(recap, dayKey(new Date(), timeZone))) return null;

  const close = () => {
    try {
      localStorage.setItem(DISMISSED_KEY, recap.weekStart);
    } catch (error) {
      if (!(error instanceof DOMException)) throw error;
    }
    setDismissed(recap.weekStart);
  };
  const badgeNames = recap.badges
    .map((b) => BADGES.find((d) => d.id === b.badgeId)?.name)
    .filter(Boolean);

  return (
    <section className="card stack" aria-labelledby="recap-title">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h2 id="recap-title" className="eyebrow">
          Dein Wochenrückblick
        </h2>
        <button className="btn btn-small" onClick={close}>
          Schließen
        </button>
      </div>
      <div
        className="grid"
        style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))' }}
      >
        <RecapStat value={recap.activeDays} label="Lerntage" />
        <RecapStat value={recap.xp} label="XP" />
        <RecapStat value={recap.quests} label="Tagesaufgaben" />
        <RecapStat value={recap.wordsMatured} label="Wörter gefestigt" />
      </div>
      <p className="muted" style={{ margin: 0 }}>
        {recap.reviewMinutes > 0 && `${recap.reviewMinutes} Minuten Karten geübt. `}
        {recap.bestDay &&
          `Bester Tag: ${new Date(`${recap.bestDay.day}T12:00:00`).toLocaleDateString('de-DE', { weekday: 'long' })} mit ${recap.bestDay.xp} XP. `}
        {badgeNames.length > 0 && `Neue Abzeichen: ${badgeNames.join(', ')}. `}
        {recap.classChallenges > 0 &&
          'Die Klassen-Challenge habt ihr gemeinsam geschafft. '}
        {recap.activeDays === 0 && 'Neue Woche, neuer Anfang – eine Tagesaufgabe genügt.'}
      </p>
    </section>
  );
}

function RecapStat({ value, label }: { value: number; label: string }) {
  return (
    <div className="stat-tile" style={{ padding: '0.5rem 0' }}>
      <div style={{ fontSize: '1.6rem', fontWeight: 700, color: 'var(--accent)' }}>
        {value}
      </div>
      <div className="muted">{label}</div>
    </div>
  );
}
