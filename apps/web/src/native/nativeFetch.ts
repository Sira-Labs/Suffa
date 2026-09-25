/**
 * Fetch for the app shell. The web view's origin is `capacitor://localhost`, so the app's
 * same-origin paths (`/api/…`, `/media/…`) are sent to the Suffa server instead. API
 * requests carry the session as a bearer token and never cookies; a token the server hands
 * out (`set-auth-token`, after the magic link) is stored, and a sign-out or a 401 forgets it.
 * Everything else (other hosts, bundled files) goes through untouched.
 */
import type { TokenStore } from './tokenStore';

const SERVER_PATHS = ['/api/', '/media/'];
const SIGN_OUT = '/api/v1/auth/sign-out';

export interface NativeFetchOptions {
  /** The Suffa server, e.g. `https://suffa.example.org` (no trailing slash). */
  apiOrigin: string;
  tokens: TokenStore;
  /** The web view's own origin, for resolving relative URLs. */
  appOrigin: string;
}

/** The server URL for an app-relative server path, or null for anything else. */
export function serverUrl(
  input: string,
  options: Pick<NativeFetchOptions, 'apiOrigin' | 'appOrigin'>
): URL | null {
  let url: URL;
  try {
    url = new URL(input, options.appOrigin);
  } catch {
    return null;
  }
  if (url.origin !== new URL(options.appOrigin).origin) return null;
  if (!SERVER_PATHS.some((prefix) => url.pathname.startsWith(prefix))) return null;
  return new URL(url.pathname + url.search, options.apiOrigin);
}

export function createNativeFetch(base: typeof fetch, options: NativeFetchOptions) {
  return async function nativeFetch(
    input: RequestInfo | URL,
    init?: RequestInit
  ): Promise<Response> {
    const original = input instanceof Request ? input.url : String(input);
    const target = serverUrl(original, options);
    if (!target) return base(input, init);

    const source = input instanceof Request ? input : null;
    const method = (init?.method ?? source?.method ?? 'GET').toUpperCase();
    const headers = new Headers(init?.headers ?? source?.headers);
    const isApi = target.pathname.startsWith('/api/');
    const token = options.tokens.current();
    if (isApi && token) headers.set('authorization', `Bearer ${token}`);
    const hasBody = method !== 'GET' && method !== 'HEAD';
    const response = await base(target.href, {
      method,
      headers,
      body: hasBody ? (init?.body ?? (await source?.arrayBuffer())) : undefined,
      signal: init?.signal ?? source?.signal,
      credentials: 'omit',
    });

    if (!isApi) return response;
    const issued = response.headers.get('set-auth-token');
    if (issued) {
      await options.tokens.save(issued);
    } else if (
      token &&
      (response.status === 401 || (target.pathname === SIGN_OUT && response.ok))
    ) {
      await options.tokens.clear();
    }
    return response;
  };
}
