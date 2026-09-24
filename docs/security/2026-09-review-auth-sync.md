# Security review: sign-in and sync (story 3.5)

- Date: 2026-09-24
- Scope: magic-link sign-in (Better Auth, ADR-0008), sessions and account self-service,
  authorisation (ADR-0009), the sync endpoints (`/api/v1/sync`), and the edge in front of
  them (CapRover nginx → Caddy in `suffa-web` → `suffa-api`).
- Method: reading the code paths, probing the live deployment from outside, reproducing
  proxy behaviour with a real Caddy 2.10, and regression tests for every fix.

## Findings

| #   | Severity | Finding                                                                                                                                                                                                                                                                                                                | Status                                                                                                                                                                              |
| --- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | High     | **Every client shared one rate-limit bucket.** Caddy trusted no proxy, replaced `X-Forwarded-For` with nginx's overlay address, and the API rate-limited by that header. Five sign-in requests from anyone locked sign-in for everyone for ten minutes; sessions recorded the proxy's address instead of the client's. | Fixed. Caddy trusts the private ranges with `trusted_proxies_strict` and sets `X-Real-IP` to the resolved client; the API reads only `X-Real-IP`. Tests cover a spoofed first hop.  |
| 2   | High     | **Better Auth exposed ~30 endpoints**, among them `get-session` and `list-sessions`, which return raw session tokens to JavaScript (defeating the httpOnly cookie), plus password reset, email change, account deletion and session updates that the product does not use.                                             | Fixed. Only `POST /sign-in/magic-link`, `GET /magic-link/verify` and `POST /sign-out` pass; everything else answers 404. Sessions are managed via `/api/v1/account` without tokens. |
| 3   | Medium   | **Open redirect** through `callbackURL` in the sign-in request or a tampered link.                                                                                                                                                                                                                                     | Fixed in story 3.1 (`rejectUnsafeRedirect`): only in-app paths.                                                                                                                     |
| 4   | Medium   | **Cross-site writes relied on SameSite=Lax alone.**                                                                                                                                                                                                                                                                    | Fixed. `sameOriginOnly` refuses state-changing `/api` requests a browser marks as cross-site (Origin / Sec-Fetch-Site).                                                             |
| 5   | Medium   | **A failed SMTP connection hung the request for two minutes** and surfaced as a 504 with nothing in the log.                                                                                                                                                                                                           | Fixed. 10/10/20 s timeouts; `mail.send_failed` logs host, port and SMTP answer (never the link or address).                                                                         |
| 6   | Low      | No `Strict-Transport-Security` header.                                                                                                                                                                                                                                                                                 | Fixed. `max-age=31536000` (no `includeSubDomains`: other apps share the domain).                                                                                                    |
| 7   | Low      | An expired or reused link returned to the settings page without explanation.                                                                                                                                                                                                                                           | Fixed. The page explains it and asks for a new link.                                                                                                                                |

## Verified as sound

- **Tokens:** magic-link tokens are stored hashed, expire after 15 minutes and work once. The
  session cookie is `HttpOnly`, `SameSite=Lax` and `Secure` in production (asserted in tests).
- **Sessions:** checked in the database on every request (no cookie cache), so an ended
  session or a role change applies on the next request.
- **Authorisation:** every route has a policy decision; the route × role matrix test fails
  on any route without one. Roles are never taken from the client (`input: false`).
- **Sync:** the user id always comes from the session; payload `user_id` is stripped; body
  limit 2 MB, at most 500 records per push, zod-validated records; keyset pagination.
- **Enumeration:** the sign-in answer is the same for known and unknown addresses.
- **Secrets:** only in CapRover environment variables; prod refuses placeholder secrets and
  dev tokens.

## Open (ticketed)

| Ticket                                | Why it waits                                                                                                                                                      | Sprint |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| Admin 2FA and audit log               | Needs the admin write routes of story 4.2; reading the user list is admin-only already.                                                                           | 4      |
| Sign-up policy                        | Anyone with an email address can create an account (rate-limited per client). Class invite links (Sprint 4) decide whether sign-up stays open or needs an invite. | 4      |
| Account deletion and data export      | GDPR story.                                                                                                                                                       | 4      |
| Remove Supabase from the CSP          | `connect-src` still allows `*.supabase.co` until the data migration (story 4.1) is done.                                                                          | 4      |
| Rate limit for sync and `/api/errors` | Authenticated sync is bounded per request; a per-user budget and a limit on the error tunnel follow with the pilot load test.                                     | 5      |
| Magic-link token in proxy access logs | nginx may log the verify URL. The token is single-use and expires in 15 minutes; switching the link to a POST confirmation page would remove it from URLs.        | 5      |
