/**
 * Passkeys of the signed-in account (ADR-0008 update 2026-09-26): add one on this device,
 * see which ones exist, remove one. Only shown with Suffa's own API in a browser that knows
 * WebAuthn.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import i18n from '@/i18n';
import { dateLocale } from '@/i18n/format';
import type { ApiSyncProvider } from '@/services/sync/ApiSyncProvider';
import { PasskeyClient, passkeysSupported, type Passkey } from '@/services/passkeys';

const date = (iso: string) =>
  new Date(iso).toLocaleDateString(dateLocale(), { dateStyle: 'medium' });

/** "iCloud-Schlüsselbund · synchronisiert" or "Passkey". */
export function describePasskey(passkey: Passkey): string {
  const name = passkey.name || passkey.provider || 'Passkey';
  return passkey.synced ? i18n.t('settings:passkeys.synced', { name }) : name;
}

export function AccountPasskeys({
  provider,
  client,
}: {
  provider: ApiSyncProvider;
  client?: PasskeyClient;
}) {
  const { t } = useTranslation(['settings', 'common']);
  const passkeys = useMemo(() => client ?? new PasskeyClient(), [client]);
  const [list, setList] = useState<Passkey[] | null>(null);
  const [message, setMessage] = useState<{ good: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const result = await provider.listPasskeys();
    if (result.ok) setList(result.value);
    else setMessage({ good: false, text: result.error.message });
  }, [provider]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!passkeysSupported()) return null;

  const add = async () => {
    setBusy(true);
    setMessage(null);
    const result = await passkeys.add();
    setBusy(false);
    if (result.ok) {
      setMessage({
        good: true,
        text: t('passkeys.addedMessage'),
      });
      void load();
    } else if (result.message) {
      setMessage({ good: false, text: result.message });
    }
  };

  const remove = async (id: string) => {
    const result = await provider.deletePasskey(id);
    setMessage(
      result.ok
        ? { good: true, text: t('passkeys.removed') }
        : { good: false, text: result.error.message }
    );
    void load();
  };

  return (
    <div className="stack" style={{ gap: '0.4rem' }}>
      <strong style={{ fontSize: '0.95rem' }}>{t('passkeys.title')}</strong>
      <span className="muted" style={{ fontSize: '0.9rem' }}>
        {t('passkeys.intro')}
      </span>
      {list?.map((p) => (
        <div key={p.id} className="row" style={{ justifyContent: 'space-between' }}>
          <span>
            🔑 {describePasskey(p)}
            <br />
            <span className="muted" style={{ fontSize: '0.85rem' }}>
              {t('passkeys.added', { date: date(p.createdAt) })}
            </span>
          </span>
          <button className="btn" onClick={() => void remove(p.id)}>
            {t('common:remove')}
          </button>
        </div>
      ))}
      <button
        className="btn"
        style={{ alignSelf: 'flex-start' }}
        disabled={busy}
        onClick={() => void add()}
      >
        {t('passkeys.add')}
      </button>
      {message && (
        <span className={message.good ? 'feedback-good' : 'feedback-bad'} role="status">
          {message.text}
        </span>
      )}
    </div>
  );
}
