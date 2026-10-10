import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { useSyncStore } from '@/state';
import { LOGIN_PATH } from '@/services/signInGate';

const STATUS_META = {
  idle: 'var(--good)',
  syncing: 'var(--info)',
  offline: 'var(--warn)',
  error: 'var(--bad)',
  disabled: 'var(--text-muted)',
} as const;

type Status = keyof typeof STATUS_META;

/** Visible sync status including the number of pending changes. */
export function SyncBadge() {
  const { t } = useTranslation('components');
  const status = useSyncStore((s) => s.status);
  const pending = useSyncStore((s) => s.pending);
  const auth = useSyncStore((s) => s.auth);
  const syncNow = useSyncStore((s) => s.syncNow);
  const provider = useSyncStore((s) => s.provider);
  const key: Status = status in STATUS_META ? (status as Status) : 'idle';

  // Not signed in on a server with sign-in: nothing is synced yet, so offer the sign-in.
  if (provider.isConfigured() && auth.status !== 'signed-in') {
    return (
      <Link to={LOGIN_PATH} className="badge" style={{ whiteSpace: 'nowrap' }}>
        {t('sync.signIn')}
      </Link>
    );
  }

  return (
    <button
      type="button"
      className="badge sync-badge"
      onClick={() => void syncNow()}
      title={t('sync.hint')}
      style={{ cursor: 'pointer', whiteSpace: 'nowrap' }}
    >
      <span
        aria-hidden
        style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: STATUS_META[key],
          display: 'inline-block',
        }}
      />
      {t(`sync.${key}`)}
      {pending > 0 && (
        <span className="muted">{t('sync.pending', { count: pending })}</span>
      )}
      {auth.status === 'signed-in' && (
        // Hidden on phones: the header has no room for it next to the logo.
        <span className="muted sync-badge-extra">{t('sync.signedIn')}</span>
      )}
    </button>
  );
}
