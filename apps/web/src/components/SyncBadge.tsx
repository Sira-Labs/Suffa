import { Link } from 'react-router-dom';
import { useSyncStore } from '@/state';
import { LOGIN_PATH } from '@/services/signInGate';

const STATUS_META: Record<string, { label: string; color: string }> = {
  idle: { label: 'Synchron', color: 'var(--good)' },
  syncing: { label: 'Synchronisiere…', color: 'var(--info)' },
  offline: { label: 'Offline', color: 'var(--warn)' },
  error: { label: 'Sync-Fehler', color: 'var(--bad)' },
  disabled: { label: 'Nur lokal', color: 'var(--text-muted)' },
};

/** Visible sync status including the number of pending changes. */
export function SyncBadge() {
  const status = useSyncStore((s) => s.status);
  const pending = useSyncStore((s) => s.pending);
  const auth = useSyncStore((s) => s.auth);
  const syncNow = useSyncStore((s) => s.syncNow);
  const provider = useSyncStore((s) => s.provider);
  const meta = STATUS_META[status] ?? STATUS_META.idle!;

  // Not signed in on a server with sign-in: nothing is synced yet, so offer the sign-in.
  if (provider.isConfigured() && auth.status !== 'signed-in') {
    return (
      <Link to={LOGIN_PATH} className="badge" style={{ whiteSpace: 'nowrap' }}>
        Anmelden
      </Link>
    );
  }

  return (
    <button
      type="button"
      className="badge"
      onClick={() => void syncNow()}
      title="Automatischer Abgleich – tippen zum sofortigen Abgleichen"
      style={{ cursor: 'pointer', whiteSpace: 'nowrap' }}
    >
      <span
        aria-hidden
        style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: meta.color,
          display: 'inline-block',
        }}
      />
      {meta.label}
      {pending > 0 && <span className="muted">· {pending} offen</span>}
      {auth.status === 'signed-in' && <span className="muted">· angemeldet</span>}
    </button>
  );
}
