import { useState } from 'react';
import { useSyncStore } from '@/state';

/**
 * Email field and "Link senden"; after sending it says where to look, takes the six-digit
 * code from the same mail (for mail apps that open the link in their own browser), and offers
 * to send again or use another address. Used by the sign-in page and the settings.
 */
export function SignInForm({
  returnTo,
  onSignedIn,
}: {
  returnTo?: string;
  /** Called after signing in with the code (the link brings the learner back by itself). */
  onSignedIn?: () => void;
}) {
  const signIn = useSyncStore((s) => s.signIn);
  const signInWithCode = useSyncStore((s) => s.signInWithCode);
  const [code, setCode] = useState('');
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

  const confirm = async () => {
    if (!sentTo) return;
    setBusy(true);
    setError(null);
    const result = await signInWithCode(sentTo, code);
    setBusy(false);
    if (result.ok) onSignedIn?.();
    else setError(result.message ?? 'Die Anmeldung hat nicht geklappt.');
  };

  if (sentTo) {
    return (
      <div className="stack">
        <span className="feedback-good" role="status">
          ✓ Link gesendet an {sentTo}
        </span>
        <span className="muted">
          Öffne die E-Mail auf diesem Gerät und tippe auf „Bei Suffa anmelden“. Link und
          Code gelten 15 Minuten. Nichts angekommen? Schau auch im Spam-Ordner nach.
        </span>
        <form
          className="stack sign-in-code"
          onSubmit={(e) => {
            e.preventDefault();
            void confirm();
          }}
        >
          <label className="stack" style={{ gap: '0.3rem' }}>
            <span>
              Öffnet deine Mail-App den Link in ihrem eigenen Browser? Dann gib hier den
              6-stelligen Code aus der Mail ein:
            </span>
            <div className="row">
              <input
                className="input sign-in-code-input"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9 ]*"
                maxLength={7}
                placeholder="123456"
                aria-label="Anmeldecode"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                required
              />
              <button className="btn btn-primary" type="submit" disabled={busy}>
                Anmelden
              </button>
            </div>
          </label>
        </form>
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
