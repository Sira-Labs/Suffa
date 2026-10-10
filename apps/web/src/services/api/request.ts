/**
 * Same-origin JSON requests to Suffa's API with the session cookie. Error codes from the API
 * become German messages the pages show as they are.
 */
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

/** Error codes shared by all areas. */
const COMMON: Record<string, string> = {
  forbidden: 'Dafür fehlt die Berechtigung.',
  unauthorized: 'Bitte melde dich an.',
  not_found: 'Nicht gefunden.',
  invalid_body: 'Die Eingabe ist ungültig.',
};

export async function apiRequest<T>(
  fetchImpl: Fetch,
  path: string,
  init: RequestInit = {},
  messages: Record<string, string> = {}
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
    return { ok: false, status: 0, code: 'offline', message: 'Keine Verbindung.' };
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
      message: messages[code] ?? COMMON[code] ?? `Serverfehler (${response.status}).`,
      ...(issues ? { issues } : {}),
    };
  }
  return { ok: true, value: body as T };
}
