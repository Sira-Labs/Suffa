/**
 * Reminders (story 6.3): one push a day at the chosen time, never in quiet hours, skipped
 * when today's learning is done; plus the weekly recap on Sunday evening (6.4). Settings
 * live on the server so every device follows the same plan.
 */
import { useEffect, useMemo, useState } from 'react';
import {
  NotificationsApi,
  type NotificationConfig,
  type NotificationPrefs,
} from '@/services/notifications/notificationsApi';
import { disablePush, enablePush, pushSupported } from '@/services/notifications/push';

export function RemindersCard() {
  const api = useMemo(() => new NotificationsApi(), []);
  const [config, setConfig] = useState<NotificationConfig | null>(null);
  const [prefs, setPrefs] = useState<NotificationPrefs | null>(null);
  const [message, setMessage] = useState<{ text: string; good: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void api.config().then((result) => {
      if (!result.ok) return setMessage({ text: result.message, good: false });
      setConfig(result.value);
      setPrefs(result.value.prefs);
    });
  }, [api]);

  if (!config || !prefs) {
    return message ? (
      <div className="card">
        <span className="feedback-bad">{message.text}</span>
      </div>
    ) : null;
  }

  const save = async (next: NotificationPrefs) => {
    setBusy(true);
    try {
      // Turning reminders or recaps on needs this device's permission and subscription.
      const wantsPush = next.reminderEnabled || next.weeklyRecap;
      if (
        wantsPush &&
        config.publicKey &&
        (next.reminderEnabled !== prefs.reminderEnabled || config.devices === 0)
      ) {
        const push = await enablePush(api, config.publicKey);
        if (!push.ok) return setMessage({ text: push.message, good: false });
      }
      if (!next.reminderEnabled && !next.weeklyRecap) await disablePush(api);
      const result = await api.savePrefs(next);
      if (!result.ok) return setMessage({ text: result.message, good: false });
      setPrefs(next);
      const fresh = await api.config();
      if (fresh.ok) setConfig(fresh.value);
      setMessage({ text: 'Gespeichert.', good: true });
    } finally {
      setBusy(false);
    }
  };

  if (!config.publicKey) {
    return (
      <div className="card stack">
        <strong>Erinnerungen</strong>
        <span className="muted">
          Erinnerungen sind auf diesem Server noch nicht eingerichtet.
        </span>
      </div>
    );
  }

  return (
    <form
      className="card stack"
      aria-labelledby="reminders-title"
      onSubmit={(e) => {
        e.preventDefault();
        void save(prefs);
      }}
    >
      <strong id="reminders-title">Erinnerungen</strong>
      {!pushSupported() && (
        <span className="muted">
          Dieses Gerät kann keine Mitteilungen empfangen. Auf iPhone/iPad: Suffa zum
          Home-Bildschirm hinzufügen und von dort öffnen.
        </span>
      )}
      <label className="row" style={{ justifyContent: 'space-between' }}>
        <span className="stack" style={{ gap: 0 }}>
          <span>Tägliche Erinnerung</span>
          <span className="muted" style={{ fontSize: '0.85rem' }}>
            Höchstens eine am Tag – und keine, wenn du schon gelernt hast
          </span>
        </span>
        <input
          type="checkbox"
          checked={prefs.reminderEnabled}
          onChange={(e) => setPrefs({ ...prefs, reminderEnabled: e.target.checked })}
        />
      </label>
      <label className="row" style={{ justifyContent: 'space-between' }}>
        <span>Uhrzeit</span>
        <input
          className="input"
          type="time"
          value={prefs.reminderTime}
          disabled={!prefs.reminderEnabled}
          onChange={(e) => setPrefs({ ...prefs, reminderTime: e.target.value })}
          style={{ width: 130 }}
        />
      </label>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <span>Ruhezeit</span>
        <span className="row">
          <input
            className="input"
            type="time"
            aria-label="Ruhezeit von"
            value={prefs.quietStart}
            onChange={(e) => setPrefs({ ...prefs, quietStart: e.target.value })}
            style={{ width: 120 }}
          />
          <span>bis</span>
          <input
            className="input"
            type="time"
            aria-label="Ruhezeit bis"
            value={prefs.quietEnd}
            onChange={(e) => setPrefs({ ...prefs, quietEnd: e.target.value })}
            style={{ width: 120 }}
          />
        </span>
      </div>
      <label className="row" style={{ justifyContent: 'space-between' }}>
        <span className="stack" style={{ gap: 0 }}>
          <span>Wochenrückblick</span>
          <span className="muted" style={{ fontSize: '0.85rem' }}>
            Sonntagabend: deine Woche in Zahlen
          </span>
        </span>
        <input
          type="checkbox"
          checked={prefs.weeklyRecap}
          onChange={(e) => setPrefs({ ...prefs, weeklyRecap: e.target.checked })}
        />
      </label>
      <div className="row">
        <button className="btn btn-primary" type="submit" disabled={busy}>
          Speichern
        </button>
        <span className="muted" style={{ fontSize: '0.85rem' }}>
          {config.devices === 0
            ? 'Noch kein Gerät angemeldet'
            : `${config.devices} ${config.devices === 1 ? 'Gerät bekommt' : 'Geräte bekommen'} Mitteilungen`}
        </span>
      </div>
      {message && (
        <span className={message.good ? 'feedback-good' : 'feedback-bad'}>
          {message.text}
        </span>
      )}
    </form>
  );
}
