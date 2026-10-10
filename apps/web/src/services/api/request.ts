/**
 * Same-origin JSON requests to Suffa's API with the session cookie. Error codes from the API
 * become messages in the interface language (story 16.3), resolved when the error is created,
 * so the pages show `message` as it is.
 */
import i18n from '@/i18n';
import type { errors } from '@/i18n/locales/de/errors';

export type ApiResult<T> =
  | { ok: true; value: T }
  | {
      ok: false;
      status: number;
      code: string;
      message: string;
      /** Details some endpoints send along (e.g. which fields failed validation). */
      issues?: string[];
    };

export type Fetch = typeof fetch;

/** An area with its own error texts (`errors:<area>.<code>` in the catalogues). */
export type ErrorArea = Exclude<keyof typeof errors, 'common'>;

/** Keys built from error codes are not known to the typed `t`. */
const untyped = i18n as unknown as { t(key: string, options?: object): string };

/**
 * The text for an API error code in the interface language: the area's own entry, else the
 * shared one, else "server error (status)" (or "no connection" for status 0).
 */
export function errorMessage(code: string, status: number, area?: ErrorArea): string {
  if (code) {
    for (const key of [area && `errors:${area}.${code}`, `errors:common.${code}`]) {
      if (key && i18n.exists(key)) return untyped.t(key);
    }
  }
  return status === 0
    ? i18n.t('errors:common.offline')
    : i18n.t('errors:common.server', { status });
}

export async function apiRequest<T>(
  fetchImpl: Fetch,
  path: string,
  init: RequestInit = {},
  area?: ErrorArea
): Promise<ApiResult<T>> {
  let response: Response;
  try {
    response = await fetchImpl(path, {
      ...init,
      credentials: 'same-origin',
      // JSON bodies are strings; a FormData body sets its own multipart boundary.
      headers:
        typeof init.body === 'string'
          ? { 'content-type': 'application/json' }
          : undefined,
    });
  } catch {
    return {
      ok: false,
      status: 0,
      code: 'offline',
      message: i18n.t('errors:common.offline'),
    };
  }
  if (response.status === 204) return { ok: true, value: undefined as T };
  const body = (await response.json().catch(() => null)) as {
    error?: string;
    issues?: unknown;
  } | null;
  if (!response.ok) {
    const code = body?.error ?? '';
    const issues = Array.isArray(body?.issues)
      ? body.issues.filter((i): i is string => typeof i === 'string')
      : undefined;
    return {
      ok: false,
      status: response.status,
      code,
      message: errorMessage(code, response.status, area),
      ...(issues ? { issues } : {}),
    };
  }
  return { ok: true, value: body as T };
}
