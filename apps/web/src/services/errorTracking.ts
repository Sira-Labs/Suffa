/**
 * Fehler-Tracking im Browser (GlitchTip, Sentry-Protokoll; Sprint-Story 2.4).
 *
 * - Aus, solange der Server keinen DSN liefert (`/api/client-config`); offline oder ohne
 *   Backend passiert nichts. `@sentry/browser` wird erst dann nachgeladen, das Start-Bundle
 *   bleibt unverändert.
 * - Meldungen laufen über den eigenen Server (`/api/errors`): kein Adblocker-Problem, CSP
 *   bleibt `connect-src 'self'`, GlitchTip sieht keine IP der Lernenden.
 * - Es werden keine Personendaten gesammelt (keine Nutzerdaten, Cookies, Header, Query-Parameter).
 */
import { logger, setErrorSink } from './logger';

const log = logger.child('errors');

export const CLIENT_CONFIG_URL = '/api/client-config';
export const ERROR_TUNNEL_URL = '/api/errors';
const CONFIG_TIMEOUT_MS = 5000;

type Context = Record<string, unknown>;
type Reporter = (error: unknown, context?: Context) => void;

let reporter: Reporter | null = null;

/** Meldet einen Fehler, falls Tracking aktiv ist; sonst No-op. Wirft nie. */
export function reportError(error: unknown, context?: Context): void {
  try {
    reporter?.(error, context);
  } catch {
    // Fehler-Tracking darf die App nie stören.
  }
}

export interface ErrorTrackingDeps {
  fetchConfig?: () => Promise<{ errorDsn: string | null }>;
  loadSdk?: () => Promise<typeof import('./sentryClient')>;
  release?: string;
  environment?: string;
}

async function defaultFetchConfig(): Promise<{ errorDsn: string | null }> {
  const res = await fetch(CLIENT_CONFIG_URL, {
    signal: AbortSignal.timeout(CONFIG_TIMEOUT_MS),
    cache: 'no-store',
  });
  if (!res.ok) return { errorDsn: null };
  const body = (await res.json()) as { errorDsn?: unknown };
  return { errorDsn: typeof body.errorDsn === 'string' ? body.errorDsn : null };
}

/**
 * Startet das Tracking, wenn der Server einen DSN meldet.
 * @returns true, wenn Tracking aktiv ist.
 */
export async function initErrorTracking(deps: ErrorTrackingDeps = {}): Promise<boolean> {
  let errorDsn: string | null;
  try {
    ({ errorDsn } = await (deps.fetchConfig ?? defaultFetchConfig)());
  } catch {
    return false; // offline oder kein Backend: normaler Zustand einer Offline-first-App
  }
  if (!errorDsn) return false;

  const Sentry = await (deps.loadSdk ?? (() => import('./sentryClient')))();
  Sentry.init({
    dsn: errorDsn,
    tunnel: ERROR_TUNNEL_URL,
    release: deps.release ?? (import.meta.env.VITE_SUFFA_VERSION || 'dev'),
    environment: deps.environment ?? (import.meta.env.PROD ? 'prod' : 'dev'),
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
    },
    sendClientReports: false,
    // Nur Fehler: keine Sitzungs-Pings (Release Health), die jeden Besuch zählen würden.
    integrations: (defaults) => defaults.filter((i) => i.name !== 'BrowserSession'),
  });
  reporter = (error, context) => {
    Sentry.withScope((scope) => {
      if (context) scope.setExtras(context);
      if (error instanceof Error) Sentry.captureException(error);
      else Sentry.captureMessage(String(error), 'error');
    });
  };
  // Alles, was die App selbst als Fehler protokolliert, wird ebenfalls gemeldet.
  setErrorSink((scope, message, context) => reportError(`${scope}: ${message}`, context));
  log.info('Fehler-Tracking aktiv');
  return true;
}

/** Nur für Tests: setzt den Modulzustand zurück. */
export function resetErrorTrackingForTests(): void {
  reporter = null;
  setErrorSink(null);
}
