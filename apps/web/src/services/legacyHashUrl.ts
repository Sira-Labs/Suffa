/**
 * Story 2.6: the app used hash URLs (`/#/units/1`) before it moved to normal paths. Bookmarks,
 * home-screen shortcuts and shared links with the old form are rewritten once, before the
 * router starts. Other hashes (e.g. `#access_token=…` from a sign-in link) stay untouched.
 */
export function legacyHashTarget(hash: string): string | null {
  if (!hash.startsWith('#/')) return null;
  const target = hash.slice(1);
  return target.startsWith('/') ? target : `/${target}`;
}

/** Rewrites the current URL in place (no reload, no new history entry). */
export function migrateLegacyHashUrl(
  location: Pick<Location, 'hash'>,
  history: Pick<History, 'replaceState'>
): void {
  const target = legacyHashTarget(location.hash);
  if (target) history.replaceState(null, '', target);
}
