/**
 * Platform hints for user-facing troubleshooting (not for feature detection:
 * features are always detected directly).
 */

/** iPhone/iPad, including iPadOS which reports itself as a Mac with touch. */
export function isIOS(
  nav: Pick<Navigator, 'userAgent' | 'maxTouchPoints'> = navigator
): boolean {
  return (
    /iPad|iPhone|iPod/.test(nav.userAgent) ||
    (/Macintosh/.test(nav.userAgent) && (nav.maxTouchPoints ?? 0) > 1)
  );
}

/** Running as an installed PWA (Home Screen app) rather than in a browser tab. */
export function isStandalonePwa(): boolean {
  if (typeof window === 'undefined') return false;
  const iosStandalone =
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return (
    iosStandalone || window.matchMedia?.('(display-mode: standalone)').matches === true
  );
}
