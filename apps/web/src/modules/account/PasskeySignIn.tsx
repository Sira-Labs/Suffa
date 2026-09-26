import { useState } from 'react';
import { passkeysSupported } from '@/services/passkeys';
import { useSyncStore } from '@/state';

/**
 * "Mit Passkey anmelden": one tap with Face ID, Touch ID or the device PIN, for learners who
 * added a passkey in the settings. Hidden in browsers without WebAuthn.
 */
export function PasskeySignIn({ onSignedIn }: { onSignedIn?: () => void }) {
  const signInWithPasskey = useSyncStore((s) => s.signInWithPasskey);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!passkeysSupported()) return null;

  const signIn = async () => {
    setBusy(true);
    setError(null);
    const result = await signInWithPasskey();
    setBusy(false);
    if (result.ok) onSignedIn?.();
    else setError(result.message ?? null);
  };

  return (
    <div className="stack" style={{ gap: '0.3rem' }}>
      <button
        className="btn passkey-sign-in"
        type="button"
        disabled={busy}
        onClick={() => void signIn()}
      >
        🔑 Mit Passkey anmelden
      </button>
      {error && <span className="feedback-bad">{error}</span>}
    </div>
  );
}
