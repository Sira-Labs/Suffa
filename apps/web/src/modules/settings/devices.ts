/**
 * Helpers for the device list on the account card: a readable name for a session's browser
 * and the time zones to choose from. Pure, so they are tested without a DOM.
 */

/** "Chrome auf Android", "Safari auf iPhone", … from a User-Agent string. */
export function describeDevice(userAgent: string | null): string {
  if (!userAgent) return 'Unbekanntes Gerät';
  const ua = userAgent;
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /OPR\/|Opera/.test(ua)
      ? 'Opera'
      : /Firefox\/|FxiOS/.test(ua)
        ? 'Firefox'
        : /Chrome\/|CriOS/.test(ua)
          ? 'Chrome'
          : /Safari\//.test(ua)
            ? 'Safari'
            : 'Browser';
  const system = /iPhone/.test(ua)
    ? 'iPhone'
    : /iPad/.test(ua)
      ? 'iPad'
      : /Android/.test(ua)
        ? 'Android'
        : /Mac OS X|Macintosh/.test(ua)
          ? 'Mac'
          : /Windows/.test(ua)
            ? 'Windows'
            : /Linux/.test(ua)
              ? 'Linux'
              : null;
  return system ? `${browser} auf ${system}` : browser;
}

/** The browser's own time zone, e.g. "Europe/Zurich". */
export function browserTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
}

/** All time zones the browser knows, with the given ones guaranteed to be included. */
export function timeZoneOptions(...include: (string | null)[]): string[] {
  const known =
    typeof Intl.supportedValuesOf === 'function'
      ? Intl.supportedValuesOf('timeZone')
      : [];
  const extra = include.filter((z): z is string => Boolean(z));
  return [...new Set([...known, 'UTC', ...extra])].sort();
}
