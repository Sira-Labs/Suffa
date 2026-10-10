/**
 * Devices and time zone of the signed-in account (story 3.4). Only shown with Suffa's own
 * API (not in offline mode).
 */
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { ApiSyncProvider, type DeviceSession } from '@/services/sync/ApiSyncProvider';
import { dateLocale } from '@/i18n/format';
import { useSyncStore } from '@/state';
import { AccountPasskeys } from './AccountPasskeys';
import { browserTimeZone, describeDevice, timeZoneOptions } from './devices';

const dateTime = (iso: string) =>
  new Date(iso).toLocaleString(dateLocale(), { dateStyle: 'medium', timeStyle: 'short' });

export function AccountDevices() {
  const { t } = useTranslation(['settings', 'common']);
  const provider = useSyncStore((s) => s.provider);
  if (!(provider instanceof ApiSyncProvider)) return null;
  return (
    <>
      {provider.currentUser()?.role === 'admin' && (
        <Link to="/admin" className="btn" style={{ alignSelf: 'flex-start' }}>
          {t('devices.openAdmin')}
        </Link>
      )}
      <TimeZoneSetting provider={provider} />
      <AccountPasskeys provider={provider} />
      <DeviceList provider={provider} />
    </>
  );
}

function TimeZoneSetting({ provider }: { provider: ApiSyncProvider }) {
  const { t } = useTranslation(['settings', 'common']);
  const [zone, setZone] = useState(provider.currentUser()?.timeZone ?? null);
  const [error, setError] = useState<string | null>(null);

  const save = useCallback(
    async (next: string) => {
      setError(null);
      const result = await provider.setTimeZone(next);
      if (result.ok) setZone(next);
      else setError(result.error.message);
    },
    [provider]
  );

  // A new account starts with the zone of the device it signed in on.
  useEffect(() => {
    if (zone === null) void save(browserTimeZone());
  }, [zone, save]);

  return (
    <label className="row" style={{ justifyContent: 'space-between' }}>
      <span>{t('devices.timeZone')}</span>
      <select
        className="input"
        style={{ maxWidth: 220 }}
        value={zone ?? browserTimeZone()}
        onChange={(e) => void save(e.target.value)}
      >
        {timeZoneOptions(zone, browserTimeZone()).map((z) => (
          <option key={z} value={z}>
            {z.replace(/_/g, ' ')}
          </option>
        ))}
      </select>
      {error && <span className="feedback-bad">{error}</span>}
    </label>
  );
}

function DeviceList({ provider }: { provider: ApiSyncProvider }) {
  const { t } = useTranslation(['settings', 'common']);
  const [sessions, setSessions] = useState<DeviceSession[] | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    const result = await provider.listSessions();
    if (result.ok) setSessions(result.value);
    else setMessage(result.error.message);
  }, [provider]);

  useEffect(() => {
    void load();
  }, [load]);

  const revoke = async (id: string) => {
    const result = await provider.revokeSession(id);
    setMessage(result.ok ? t('devices.signedOut') : result.error.message);
    void load();
  };

  const revokeOthers = async () => {
    const result = await provider.revokeOtherSessions();
    setMessage(
      result.ok
        ? t('devices.othersSignedOut', { count: result.value })
        : result.error.message
    );
    void load();
  };

  if (!sessions) return message ? <span className="muted">{message}</span> : null;
  const others = sessions.filter((s) => !s.current);

  return (
    <div className="stack" style={{ gap: '0.4rem' }}>
      <strong style={{ fontSize: '0.95rem' }}>{t('devices.title')}</strong>
      {sessions.map((s) => (
        <div key={s.id} className="row" style={{ justifyContent: 'space-between' }}>
          <span>
            {describeDevice(s.userAgent)}
            {s.current && <span className="muted"> · {t('common:thisDevice')}</span>}
            <br />
            <span className="muted" style={{ fontSize: '0.85rem' }}>
              {t('devices.lastActive', { when: dateTime(s.lastActiveAt) })}
            </span>
          </span>
          {!s.current && (
            <button className="btn" onClick={() => void revoke(s.id)}>
              {t('common:signOut')}
            </button>
          )}
        </div>
      ))}
      {others.length > 0 && (
        <button className="btn" onClick={() => void revokeOthers()}>
          {t('devices.signOutOthers')}
        </button>
      )}
      {message && <span className="muted">{message}</span>}
    </div>
  );
}
