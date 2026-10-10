import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useSyncStore } from '@/state';
import { signInLinkError } from '@/modules/settings/Settings';
import { PasskeySignIn } from './PasskeySignIn';
import { SignInForm } from './SignInForm';
import { safeNext, setSignInSkipped, signInReturnPath } from '@/services/signInGate';

/** The sign-in page (/login): shown first to learners who are not signed in. */
export function SignIn() {
  const { t } = useTranslation(['account', 'common']);
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
        <h1 style={{ margin: 0 }}>{t('title')}</h1>
        {auth.status === 'signed-in' ? (
          <>
            <span className="feedback-good">
              {t('signedInAs', { who: auth.user.email ?? auth.user.id })}
            </span>
            <button
              className="btn btn-primary"
              type="button"
              onClick={() => navigate(next, { replace: true })}
            >
              {t('common:continue')}
            </button>
          </>
        ) : (
          <>
            <p className="muted" style={{ margin: 0 }}>
              {t('intro')}
            </p>
            {linkError && <span className="feedback-bad">{linkError}</span>}
            <SignInForm
              returnTo={signInReturnPath(next)}
              onSignedIn={() => navigate(next, { replace: true })}
            />
            <PasskeySignIn onSignedIn={() => navigate(next, { replace: true })} />
            <button className="btn sign-in-skip" type="button" onClick={continueLocally}>
              {t('skip')}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
