import { useState } from 'react';
import { useSyncStore } from '@/state';

/**
 * Email field and "Link senden"; after sending it says where to look and offers to send
 * again or use another address. Used by the sign-in page and the settings.
 */
export function SignInForm({ returnTo }: { returnTo?: string }) {
  const signIn = useSyncStore((s) => s.signIn);
  const [email, setEmail] = useState('');
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const send = async () => {
    setBusy(true);
    setError(null);
    const result = await signIn(email, returnTo);
    setBusy(false);
    if (result.ok) setSentTo(email.trim());
    else setError(result.message ?? 'Der Anmeldelink konnte nicht gesendet werden.');
  };

  if (sentTo) {
    return (
      <div className="stack" role="status">
        <span className="feedback-good">✓ Link gesendet an {sentTo}</span>
        <span className="muted">
          Öffne die E-Mail auf diesem Gerät und tippe auf „Bei Suffa anmelden“. Der Link
          gilt 15 Minuten. Nichts angekommen? Schau auch im Spam-Ordner nach.
        </span>
        <div className="row">
          <button
            className="btn"
            type="button"
            disabled={busy}
            onClick={() => void send()}
          >
            Nochmal senden
          </button>
          <button className="btn" type="button" onClick={() => setSentTo(null)}>
            Andere E-Mail-Adresse
          </button>
        </div>
        {error && <span className="feedback-bad">{error}</span>}
      </div>
    );
  }

  return (
    <form
      className="stack"
      onSubmit={(e) => {
        e.preventDefault();
        void send();
      }}
    >
      <div className="row">
        <input
          className="input"
          type="email"
          autoComplete="email"
          inputMode="email"
          placeholder="du@example.com"
          aria-label="E-Mail-Adresse"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          style={{ flex: 1, minWidth: 0 }}
        />
        <button className="btn btn-primary" type="submit" disabled={busy}>
          Link senden
        </button>
      </div>
      {error && <span className="feedback-bad">{error}</span>}
    </form>
  );
}
