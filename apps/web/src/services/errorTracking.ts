/**
 * Error tracking in the browser (GlitchTip, Sentry protocol; sprint story 2.4).
 *
 * - Off as long as the server provides no DSN (`/api/client-config`); offline or without a
 *   backend nothing happens. `@sentry/browser` is only lazy-loaded then; the initial bundle
 *   stays unchanged.
 * - Reports go through our own server (`/api/errors`): no ad-blocker problem, CSP
 *   stays `connect-src 'self'`, GlitchTip never sees a learner's IP.
 * - No personal data is collected (no user data, cookies, headers, query parameters).
 */
import { logger, setErrorSink } from './logger';

const log = logger.child('errors');

export const CLIENT_CONFIG_URL = '/api/client-config';
export const ERROR_TUNNEL_URL = '/api/errors';
const CONFIG_TIMEOUT_MS = 5000;

type Context = Record<string, unknown>;
type Reporter = (error: unknown, context?: Context) => void;

let reporter: Reporter | null = null;

/** Reports an error if tracking is active; otherwise a no-op. Never throws. */
export function reportError(error: unknown, context?: Context): void {
  try {
    reporter?.(error, context);
  } catch {
    // Error tracking must never disrupt the app.
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
 * Starts tracking if the server reports a DSN.
 * @returns true if tracking is active.
 */
export async function initErrorTracking(deps: ErrorTrackingDeps = {}): Promise<boolean> {
  let errorDsn: string | null;
  try {
    ({ errorDsn } = await (deps.fetchConfig ?? defaultFetchConfig)());
  } catch {
    return false; // offline or no backend: the normal state of an offline-first app
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
    // Errors only: no session pings (release health) that would count every visit.
    integrations: (defaults) => defaults.filter((i) => i.name !== 'BrowserSession'),
  });
  reporter = (error, context) => {
    Sentry.withScope((scope) => {
      if (context) scope.setExtras(context);
      if (error instanceof Error) Sentry.captureException(error);
      else Sentry.captureMessage(String(error), 'error');
    });
  };
  // Everything the app itself logs as an error is reported as well.
  setErrorSink((scope, message, context) => reportError(`${scope}: ${message}`, context));
  log.info('Error tracking active');
  return true;
}

/** Tests only: resets the module state. */
export function resetErrorTrackingForTests(): void {
  reporter = null;
  setErrorSink(null);
}
