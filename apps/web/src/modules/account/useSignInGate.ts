import { useLocation } from 'react-router-dom';
import { ApiSyncProvider } from '@/services/sync/ApiSyncProvider';
import { useSyncStore } from '@/state';
import { loginRedirect, needsSignIn, signInSkipped } from '@/services/signInGate';

/** Where to send the learner before the app (the sign-in page), or null to go on. */
export function useSignInGate(): string | null {
  const { pathname, search } = useLocation();
  const provider = useSyncStore((s) => s.provider);
  const auth = useSyncStore((s) => s.auth);
  const checked = useSyncStore((s) => s.authChecked);
  const gate = needsSignIn({
    pathname,
    configured: provider.isConfigured(),
    checked,
    serverDown: provider instanceof ApiSyncProvider && provider.isServerDown(),
    signedIn: auth.status === 'signed-in',
    skipped: signInSkipped(),
  });
  return gate ? loginRedirect(pathname, search) : null;
}
