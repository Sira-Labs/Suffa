/**
 * Reminders (story 6.3): one push a day at the chosen time, never in quiet hours, skipped
 * when today's learning is done; plus the weekly recap on Sunday evening (6.4). Settings
 * live on the server so every device follows the same plan.
 */
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  NotificationsApi,
  type NotificationConfig,
  type NotificationPrefs,
} from '@/services/notifications/notificationsApi';
import { nativeBridge } from '@/native/install';
import {
  appChannel,
  webPushChannel,
  type ReminderChannel,
} from '@/services/notifications/channel';

export function RemindersCard() {
  const { t } = useTranslation(['settings', 'common']);
  const api = useMemo(() => new NotificationsApi(), []);
  const channel = useMemo<ReminderChannel>(() => {
    const bridge = nativeBridge();
    return bridge ? appChannel(bridge) : webPushChannel;
  }, []);
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
        (next.reminderEnabled !== prefs.reminderEnabled || config.devices === 0)
      ) {
        const push = await channel.enable(api, config);
        if (!push.ok) return setMessage({ text: push.message, good: false });
      }
      if (!wantsPush) await channel.disable(api, config);
      const result = await api.savePrefs(next);
      if (!result.ok) return setMessage({ text: result.message, good: false });
      await channel.saved(next, config);
      setPrefs(next);
      const fresh = await api.config();
      if (fresh.ok) setConfig(fresh.value);
      setMessage({ text: t('common:saved'), good: true });
    } finally {
      setBusy(false);
    }
  };

  if (!channel.available(config)) {
    return (
      <div className="card stack">
        <strong>{t('reminders.title')}</strong>
        <span className="muted">{t('reminders.unavailable')}</span>
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
      <strong id="reminders-title">{t('reminders.title')}</strong>
      {channel.hint() && <span className="muted">{channel.hint()}</span>}
      <label className="row" style={{ justifyContent: 'space-between' }}>
        <span className="stack" style={{ gap: 0 }}>
          <span>{t('reminders.daily')}</span>
          <span className="muted" style={{ fontSize: '0.85rem' }}>
            {t('reminders.dailyHint')}
          </span>
        </span>
        <input
          type="checkbox"
          checked={prefs.reminderEnabled}
          onChange={(e) => setPrefs({ ...prefs, reminderEnabled: e.target.checked })}
        />
      </label>
      <label className="row" style={{ justifyContent: 'space-between' }}>
        <span>{t('reminders.time')}</span>
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
        <span>{t('reminders.quiet')}</span>
        <span className="row">
          <input
            className="input"
            type="time"
            aria-label={t('reminders.quietFrom')}
            value={prefs.quietStart}
            onChange={(e) => setPrefs({ ...prefs, quietStart: e.target.value })}
            style={{ width: 120 }}
          />
          <span>{t('reminders.until')}</span>
          <input
            className="input"
            type="time"
            aria-label={t('reminders.quietTo')}
            value={prefs.quietEnd}
            onChange={(e) => setPrefs({ ...prefs, quietEnd: e.target.value })}
            style={{ width: 120 }}
          />
        </span>
      </div>
      <label className="row" style={{ justifyContent: 'space-between' }}>
        <span className="stack" style={{ gap: 0 }}>
          <span>{t('reminders.recap')}</span>
          <span className="muted" style={{ fontSize: '0.85rem' }}>
            {t('reminders.recapHint')}
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
          {t('common:save')}
        </button>
        <span className="muted" style={{ fontSize: '0.85rem' }}>
          {channel.status(config)}
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
