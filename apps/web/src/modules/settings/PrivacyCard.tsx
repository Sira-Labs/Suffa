/**
 * "Meine Daten" (story 4.4): download everything the server stores about you, or delete the
 * account for good – with the own email address as confirmation.
 */
import { useMemo, useState } from 'react';
import { PrivacyApi } from '@/services/privacy/privacyApi';
import { db } from '@/services/storage';
import { ApiSyncProvider } from '@/services/sync/ApiSyncProvider';
import { useSyncStore } from '@/state';

export function PrivacyCard() {
  const provider = useSyncStore((s) => s.provider);
  const auth = useSyncStore((s) => s.auth);
  const api = useMemo(() => new PrivacyApi(), []);
  const [confirming, setConfirming] = useState(false);
  const [email, setEmail] = useState('');
  const [alsoLocal, setAlsoLocal] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  if (!(provider instanceof ApiSyncProvider) || auth.status !== 'signed-in') return null;

  const download = async () => {
    const result = await api.exportFile();
    if (!result.ok) return setMessage(result.message);
    const link = document.createElement('a');
    link.href = URL.createObjectURL(
      new Blob([result.json], { type: 'application/json' })
    );
    link.download = result.name;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const remove = async (e: React.FormEvent) => {
    e.preventDefault();
    const result = await api.deleteAccount(email);
    if (!result.ok) return setMessage(result.message);
    if (alsoLocal) await db.delete();
    window.location.assign('/');
  };

  return (
    <div className="card stack">
      <strong>Meine Daten</strong>
      <p className="muted" style={{ margin: 0 }}>
        Du kannst jederzeit alles herunterladen, was Suffa über dich speichert, oder dein
        Konto mit allen Daten löschen.
      </p>
      <div className="row">
        <button className="btn" onClick={() => void download()}>
          Daten herunterladen
        </button>
        {!confirming && (
          <button className="btn" onClick={() => setConfirming(true)}>
            Konto löschen …
          </button>
        )}
      </div>
      {confirming && (
        <form className="stack" onSubmit={(e) => void remove(e)}>
          <span>
            Das löscht dein Konto, deinen Lernstand auf dem Server und deine
            Klassenmitgliedschaften.{' '}
            <strong>Das lässt sich nicht rückgängig machen.</strong> Gib zur Bestätigung
            deine E-Mail-Adresse ein:
          </span>
          <input
            className="input"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={auth.user.email ?? ''}
            aria-label="E-Mail-Adresse zur Bestätigung"
          />
          <label className="row">
            <input
              type="checkbox"
              checked={alsoLocal}
              onChange={(e) => setAlsoLocal(e.target.checked)}
            />
            <span>Auch die Daten auf diesem Gerät löschen</span>
          </label>
          <div className="row">
            <button
              className="btn"
              type="submit"
              disabled={!email.trim()}
              style={{ color: 'var(--bad)' }}
            >
              Endgültig löschen
            </button>
            <button className="btn" type="button" onClick={() => setConfirming(false)}>
              Abbrechen
            </button>
          </div>
        </form>
      )}
      {message && <span className="feedback-bad">{message}</span>}
    </div>
  );
}
