import { useNavigate, useSearchParams } from 'react-router-dom';
import { useSyncStore } from '@/state';
import { signInLinkError } from '@/modules/settings/Settings';
import { SignInForm } from './SignInForm';
import { safeNext, setSignInSkipped, signInReturnPath } from '@/services/signInGate';

/** The sign-in page (/login): shown first to learners who are not signed in. */
export function SignIn() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const auth = useSyncStore((s) => s.auth);
  const next = safeNext(params.get('next'));
  const linkError = signInLinkError(params.get('error'));

  const continueLocally = () => {
    setSignInSkipped(true);
    navigate(next, { replace: true });
  };

  return (
    <div className="sign-in">
      <div className="card stack sign-in-card">
        <div className="sign-in-brand">
          <img src="/brand/suffa-mark.svg" alt="" width={64} height={64} />
          <span className="arabic-inline" lang="ar">
            الصُّفَّة
          </span>
        </div>
        <h1 style={{ margin: 0 }}>Bei Suffa anmelden</h1>
        {auth.status === 'signed-in' ? (
          <>
            <span className="feedback-good">
              ✓ Du bist angemeldet als {auth.user.email ?? auth.user.id}.
            </span>
            <button
              className="btn btn-primary"
              type="button"
              onClick={() => navigate(next, { replace: true })}
            >
              Weiter
            </button>
          </>
        ) : (
          <>
            <p className="muted" style={{ margin: 0 }}>
              Ohne Passwort: Gib deine E-Mail-Adresse ein, und wir schicken dir einen
              Anmeldelink. Mit demselben Konto lernst du auf Handy und Computer weiter,
              und deine Klasse sieht deinen Fortschritt.
            </p>
            {linkError && <span className="feedback-bad">{linkError}</span>}
            <SignInForm returnTo={signInReturnPath(next)} />
            <button className="btn sign-in-skip" type="button" onClick={continueLocally}>
              Ohne Konto weiter – dein Lernstand bleibt nur auf diesem Gerät
            </button>
          </>
        )}
      </div>
    </div>
  );
}
