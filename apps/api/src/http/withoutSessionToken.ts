/**
 * Signing in with the code or a passkey answers with the session token in the body and in
 * `set-auth-token` (adding a passkey, with the stored credential). The browser needs neither: its session is the httpOnly cookie,
 * and a token readable by scripts is what an injected script would steal. Only the native app
 * (ADR-0019, its origins in SUFFA_APP_ORIGINS) keeps the header, as after the magic link.
 */
export async function withoutSessionToken(
  response: Response,
  origin: string | undefined,
  appOrigins: readonly string[]
): Promise<Response> {
  const headers = new Headers(response.headers);
  if (!origin || !appOrigins.includes(origin)) headers.delete('set-auth-token');
  if (!response.ok)
    return new Response(response.body, { status: response.status, headers });
  headers.delete('content-length');
  headers.set('content-type', 'application/json');
  return new Response(JSON.stringify({ ok: true }), { status: response.status, headers });
}
