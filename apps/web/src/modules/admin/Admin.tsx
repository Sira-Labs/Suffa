/**
 * Admin area (story 4.2): users (search, role, disable) and the audit log. Admin actions need
 * the second factor: the page walks through setting up an authenticator app (QR code) and
 * asks for a code once per session (valid 12 hours).
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import QRCode from 'qrcode';
import { dateLocale } from '@/i18n/format';
import { ApiSyncProvider } from '@/services/sync/ApiSyncProvider';
import {
  AdminApi,
  describeAudit,
  roleLabel,
  type AdminUser,
  type AuditEntry,
  type Role,
} from '@/services/admin/adminApi';
import { useSyncStore } from '@/state';
import { AiAdmin } from './AiAdmin';
import { ContentAdmin } from './ContentAdmin';
import { FeedbackAdmin } from './FeedbackAdmin';
import { VideoAdmin } from './VideoAdmin';

const dateTime = (iso: string) =>
  new Date(iso).toLocaleString(dateLocale(), { dateStyle: 'short', timeStyle: 'short' });

export function Admin() {
  const { t } = useTranslation('admin');
  const provider = useSyncStore((s) => s.provider);
  const api = useMemo(() => new AdminApi(), []);
  const [status, setStatus] = useState<{ enabled: boolean; confirmed: boolean } | null>(
    null
  );
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const result = await api.twoFactorStatus();
    if (result.ok) setStatus(result.value);
    else setError(result.message);
  }, [api]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const isAdmin =
    provider instanceof ApiSyncProvider && provider.currentUser()?.role === 'admin';
  if (!isAdmin) {
    return (
      <div className="stack">
        <h1>{t('title')}</h1>
        <p className="muted">{t('adminsOnly')}</p>
      </div>
    );
  }

  return (
    <div className="stack">
      <h1>{t('title')}</h1>
      {error && <span className="feedback-bad">{error}</span>}
      {status && !status.confirmed && (
        <SecondFactor api={api} enabled={status.enabled} onConfirmed={refresh} />
      )}
      {status?.confirmed && <AdminTabs api={api} />}
    </div>
  );
}

function SecondFactor({
  api,
  enabled,
  onConfirmed,
}: {
  api: AdminApi;
  enabled: boolean;
  onConfirmed: () => Promise<void>;
}) {
  const { t } = useTranslation('admin');
  const [setup, setSetup] = useState<{ secret: string; qr: string } | null>(null);
  const [code, setCode] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  const start = async () => {
    setMessage(null);
    const result = await api.twoFactorSetup();
    if (!result.ok) return setMessage(result.message);
    const qr = await QRCode.toDataURL(result.value.uri, { margin: 1, width: 220 });
    setSetup({ secret: result.value.secret, qr });
  };

  const confirm = async (e: React.FormEvent) => {
    e.preventDefault();
    const result = await api.twoFactorConfirm(code);
    if (!result.ok) return setMessage(result.message);
    setCode('');
    await onConfirmed();
  };

  return (
    <div className="card stack">
      <strong>{t('secondFactor.title')}</strong>
      {!enabled && !setup && (
        <>
          <p className="muted" style={{ margin: 0 }}>
            {t('secondFactor.intro')}
          </p>
          <button className="btn btn-primary" onClick={() => void start()}>
            {t('secondFactor.setUp')}
          </button>
        </>
      )}
      {setup && (
        <div className="stack" style={{ alignItems: 'flex-start' }}>
          <span>{t('secondFactor.scan')}</span>
          <img src={setup.qr} alt={t('secondFactor.qrAlt')} width={220} height={220} />
          <span className="muted" style={{ fontSize: '0.85rem', wordBreak: 'break-all' }}>
            <Trans
              t={t}
              i18nKey="secondFactor.manual"
              values={{ secret: setup.secret }}
              components={{ 1: <code /> }}
            />
          </span>
          <span>{t('secondFactor.enterCode')}</span>
        </div>
      )}
      {(enabled || setup) && (
        <form className="row" onSubmit={(e) => void confirm(e)}>
          <input
            className="input"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]{6}"
            maxLength={6}
            placeholder="123456"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            style={{ width: 120 }}
            aria-label={t('secondFactor.code')}
          />
          <button className="btn btn-primary" type="submit" disabled={code.length !== 6}>
            {t('secondFactor.confirm')}
          </button>
        </form>
      )}
      {message && <span className="feedback-bad">{message}</span>}
    </div>
  );
}

const TABS = ['users', 'audit', 'ai', 'videos', 'content', 'feedback'] as const;

function AdminTabs({ api }: { api: AdminApi }) {
  const { t } = useTranslation('admin');
  const [tab, setTab] = useState<(typeof TABS)[number]>('users');
  return (
    <>
      <div className="row" role="tablist">
        {TABS.map((id) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            className={`btn ${tab === id ? 'btn-primary' : ''}`}
            onClick={() => setTab(id)}
          >
            {t(`tabs.${id}`)}
          </button>
        ))}
      </div>
      {tab === 'users' && <Users api={api} />}
      {tab === 'audit' && <Audit api={api} />}
      {tab === 'ai' && <AiAdmin />}
      {tab === 'videos' && <VideoAdmin />}
      {tab === 'content' && <ContentAdmin />}
      {tab === 'feedback' && <FeedbackAdmin />}
    </>
  );
}

function Users({ api }: { api: AdminApi }) {
  const { t } = useTranslation('admin');
  const [search, setSearch] = useState('');
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(
    async (cursor: string | null) => {
      const result = await api.listUsers({ search: search.trim(), cursor });
      if (!result.ok) return setMessage(result.message);
      setUsers((prev) =>
        cursor ? [...prev, ...result.value.users] : result.value.users
      );
      setNext(result.value.next);
    },
    [api, search]
  );

  useEffect(() => {
    const timer = setTimeout(() => void load(null), 250);
    return () => clearTimeout(timer);
  }, [load]);

  const change = async (user: AdminUser, update: { role?: Role; disabled?: boolean }) => {
    if (
      update.disabled &&
      !window.confirm(t('users.confirmDisable', { who: user.email ?? user.id }))
    )
      return;
    const result = await api.updateUser(user.id, update);
    if (!result.ok) return setMessage(result.message);
    setMessage(null);
    setUsers((prev) => prev.map((u) => (u.id === user.id ? result.value : u)));
  };

  return (
    <div className="card stack">
      <input
        className="input"
        type="search"
        placeholder={t('users.search')}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        aria-label={t('users.searchLabel')}
      />
      {message && <span className="feedback-bad">{message}</span>}
      {users.map((user) => (
        <div
          key={user.id}
          className="row"
          style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}
        >
          <span style={{ opacity: user.disabled ? 0.6 : 1 }}>
            <strong>{user.email ?? '–'}</strong>
            {user.disabled && <span className="feedback-bad">{t('users.disabled')}</span>}
            <br />
            <span className="muted" style={{ fontSize: '0.85rem' }}>
              {t('users.since', { date: dateTime(user.createdAt) })}
            </span>
          </span>
          <span className="row">
            <select
              className="input"
              value={user.role}
              onChange={(e) => void change(user, { role: e.target.value as Role })}
              aria-label={t('users.roleOf', { who: user.email ?? user.id })}
            >
              {(['student', 'teacher', 'admin'] as const).map((r) => (
                <option key={r} value={r}>
                  {roleLabel(r)}
                </option>
              ))}
            </select>
            <button
              className="btn"
              onClick={() => void change(user, { disabled: !user.disabled })}
            >
              {user.disabled ? t('users.enable') : t('users.disable')}
            </button>
          </span>
        </div>
      ))}
      {users.length === 0 && <span className="muted">{t('users.none')}</span>}
      {next && (
        <button className="btn" onClick={() => void load(next)}>
          {t('users.more')}
        </button>
      )}
    </div>
  );
}

function Audit({ api }: { api: AdminApi }) {
  const { t } = useTranslation('admin');
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(
    async (before: string | null) => {
      const result = await api.listAudit(before);
      if (!result.ok) return setMessage(result.message);
      setEntries((prev) =>
        before ? [...prev, ...result.value.entries] : result.value.entries
      );
      setNext(result.value.next);
    },
    [api]
  );

  useEffect(() => {
    void load(null);
  }, [load]);

  return (
    <div className="card stack">
      {message && <span className="feedback-bad">{message}</span>}
      {entries.map((entry) => (
        <div key={entry.id}>
          <strong>{describeAudit(entry)}</strong>
          <br />
          <span className="muted" style={{ fontSize: '0.85rem' }}>
            {t('audit.meta', {
              date: dateTime(entry.createdAt),
              who: entry.actorEmail ?? t('audit.unknownActor'),
            })}
          </span>
        </div>
      ))}
      {entries.length === 0 && <span className="muted">{t('audit.none')}</span>}
      {next && (
        <button className="btn" onClick={() => void load(next)}>
          {t('audit.older')}
        </button>
      )}
    </div>
  );
}
