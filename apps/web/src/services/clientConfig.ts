/**
 * What the server tells the PWA at start (`/api/client-config`): the error-tracking DSN and
 * whether the feedback button is on. Fetched once per page load; offline or without a backend
 * the promise rejects and callers fall back to "off".
 */
export const CLIENT_CONFIG_URL = '/api/client-config';
const CONFIG_TIMEOUT_MS = 5000;

export interface ClientConfig {
  errorDsn: string | null;
  feedback: boolean;
}

let cached: Promise<ClientConfig> | null = null;

async function fetchClientConfig(): Promise<ClientConfig> {
  const res = await fetch(CLIENT_CONFIG_URL, {
    signal: AbortSignal.timeout(CONFIG_TIMEOUT_MS),
    cache: 'no-store',
  });
  if (!res.ok) return { errorDsn: null, feedback: false };
  const body = (await res.json()) as { errorDsn?: unknown; feedback?: unknown };
  return {
    errorDsn: typeof body.errorDsn === 'string' ? body.errorDsn : null,
    feedback: body.feedback === true,
  };
}

export function loadClientConfig(): Promise<ClientConfig> {
  cached ??= fetchClientConfig();
  // A failed fetch is not kept, so the next caller tries again (e.g. back online).
  cached.catch(() => {
    cached = null;
  });
  return cached;
}

/** Tests only. */
export function resetClientConfigForTests(): void {
  cached = null;
}
