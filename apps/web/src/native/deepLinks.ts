/**
 * Links that open the app (Universal Links / App Links, ADR-0019): the sign-in link from the
 * mail and class invitations. The sign-in link is verified by the app itself (without its
 * callback, so the server answers with the token instead of a redirect); the page it would
 * have led to is then opened inside the app.
 */
import { logger } from '@/services/logger';

const log = logger.child('native:links');

export const MAGIC_LINK_PATH = '/api/v1/auth/magic-link/verify';
const DEFAULT_RETURN = '/settings?angemeldet=1';

export interface DeepLinkDeps {
  fetch: typeof fetch;
  navigate: (path: string) => void;
  /** Re-reads who is signed in after a verified link. */
  signedIn: () => Promise<void>;
}

/** An in-app path (never another origin, never `//host`), or null. */
export function inAppPath(value: string | null): string | null {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return null;
  return value;
}

export type DeepLinkOutcome = 'signed-in' | 'sign-in-failed' | 'navigated' | 'ignored';

export async function openDeepLink(
  raw: string,
  deps: DeepLinkDeps
): Promise<DeepLinkOutcome> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    log.warn('unreadable app link');
    return 'ignored';
  }

  if (url.pathname === MAGIC_LINK_PATH) {
    const token = url.searchParams.get('token');
    if (!token) return 'ignored';
    const returnTo = inAppPath(url.searchParams.get('callbackURL')) ?? DEFAULT_RETURN;
    // Same codes as Better Auth's redirect on the web, so the settings page explains them.
    let error: string | null = null;
    try {
      const response = await deps.fetch(
        `${MAGIC_LINK_PATH}?${new URLSearchParams({ token })}`
      );
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          code?: string;
        } | null;
        error = body?.code ?? 'FAILED';
        log.warn('sign-in link rejected', { status: response.status, code: error });
      }
    } catch (failure) {
      log.warn('sign-in link not verified (offline?)', { error: String(failure) });
      error = 'OFFLINE';
    }
    if (error) {
      deps.navigate(`/settings?${new URLSearchParams({ error })}`);
      return 'sign-in-failed';
    }
    await deps.signedIn();
    deps.navigate(returnTo);
    return 'signed-in';
  }

  if (url.pathname.startsWith('/join/')) {
    deps.navigate(url.pathname + url.search);
    return 'navigated';
  }
  return 'ignored';
}
