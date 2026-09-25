/**
 * The sign-in page comes first: a learner who is not signed in lands on /login before the
 * app. Suffa stays offline-first, so the page also offers "ohne Konto weiter" (learning stays
 * on this device), and nothing is gated while the server has not answered (offline, outage)
 * or has no sign-in at all.
 */
export const LOGIN_PATH = '/login';
/** Marker the magic link brings back, so the page can confirm the sign-in once. */
export const SIGNED_IN_FLAG = 'angemeldet';

const SKIP_KEY = 'suffa.signIn.skipped';

/** Pages reachable without an account: the sign-in page and invitations (own sign-in). */
const OPEN_PATHS = [LOGIN_PATH, '/join'];

export interface GateInput {
  pathname: string;
  /** The server has sign-in (not a local-only build). */
  configured: boolean;
  /** The server answered who is signed in. */
  checked: boolean;
  serverDown: boolean;
  signedIn: boolean;
  skipped: boolean;
}

export function needsSignIn(input: GateInput): boolean {
  if (!input.configured || !input.checked || input.serverDown) return false;
  if (input.signedIn || input.skipped) return false;
  return !OPEN_PATHS.some(
    (p) => input.pathname === p || input.pathname.startsWith(`${p}/`)
  );
}

/** An in-app path to return to; anything else (other origins, the login page) is home. */
export function safeNext(raw: string | null): string {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/\\')) {
    return '/';
  }
  const path = raw.split(/[?#]/)[0]!;
  return path === LOGIN_PATH || path.startsWith(`${LOGIN_PATH}/`) ? '/' : raw;
}

/**
 * /login for the page the learner wanted. A failed magic link comes back with ?error=…
 * (Better Auth); that goes along, so the sign-in page can explain it.
 */
export function loginRedirect(pathname: string, search: string): string {
  const current = new URLSearchParams(search);
  const params = new URLSearchParams();
  const error = current.get('error');
  current.delete('error');
  const rest = current.toString();
  const next = `${pathname}${rest ? `?${rest}` : ''}`;
  if (next !== '/') params.set('next', next);
  if (error) params.set('error', error);
  const query = params.toString();
  return query ? `${LOGIN_PATH}?${query}` : LOGIN_PATH;
}

/** Where the magic link leads: the wanted page, marked as just signed in. */
export function signInReturnPath(next: string): string {
  const [path, query = ''] = next.split('?');
  const params = new URLSearchParams(query);
  params.set(SIGNED_IN_FLAG, '1');
  return `${path}?${params.toString()}`;
}

/** Browser storage can be missing or blocked (private mode); then nothing is remembered. */
function storage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch (error) {
    if (error instanceof DOMException) return null;
    throw error;
  }
}

export function signInSkipped(): boolean {
  try {
    return storage()?.getItem(SKIP_KEY) === '1';
  } catch (error) {
    if (error instanceof DOMException) return false;
    throw error;
  }
}

/** Remembers "ohne Konto weiter" on this device, or forgets it (`false`). */
export function setSignInSkipped(skipped: boolean): void {
  try {
    const store = storage();
    if (skipped) store?.setItem(SKIP_KEY, '1');
    else store?.removeItem(SKIP_KEY);
  } catch (error) {
    if (!(error instanceof DOMException)) throw error;
  }
}
