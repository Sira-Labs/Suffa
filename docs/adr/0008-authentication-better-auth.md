# ADR-0008: Authentication with Better Auth (self-hosted)

- Status: accepted (2026-09-24: magic link only)
- Date: 2026-09-23

## Context

We need magic link (keeps today's UX), email + password, passkeys, optional Google login,
session management across devices, admin user management, and it must run inside our API on
CapRover with our Postgres. The PWA must keep working offline with a cached identity.

## Decision

- Use **Better Auth** mounted at `/v1/auth/*` in the Hono API, Drizzle adapter on Postgres.
  Plugins: `magicLink`, `passkey`, `admin` (ban, impersonate, set role), optional `twoFactor`
  for admins (mandatory for `admin` role).
- **Sessions:** httpOnly, `Secure`, `SameSite=Lax` cookies. Web and API are **same-origin**:
  `suffa-web`'s Caddy proxies `/api` to the API (Tabayyun pattern), so no CORS and no
  third-party cookies. No tokens in `localStorage`. Native apps (ADR-0019) use Better Auth's
  bearer mode with the token in Keychain/Keystore.
- **Offline:** the PWA caches the last `/me` response (id, role, name) in IndexedDB to render
  the correct UI offline; any server call revalidates. Role-gated screens (admin/teacher) are
  hidden offline and always enforced server-side.
- Email delivery via SMTP env config.
- **Shared identity with Tabayyun (later, optional):** Tabayyun plans Keycloak/Zitadel (its
  ADR-0006). If that IdP goes live, Suffa adds it as an OIDC provider (Better Auth generic
  OAuth) for single sign-on for admins and teachers, without changing student login.

## Update 2026-09-24: magic link only

- **Sign-in is by magic link only** (product decision): no passwords, no passkeys for now.
  Links are valid 15 minutes, work once and are stored hashed. Better Auth runs at
  `/api/v1/auth/*`; its field names are mapped onto our snake_case tables (migration 0003),
  user ids stay UUIDs.
- **Mail:** SMTP via `SUFFA_SMTP_*` through the **Google Workspace SMTP relay**
  (`smtp-relay.gmail.com`), the same setup as Tabayyun: the server is allowed by IP and/or SMTP
  authentication, mails go out from an address of the own domain (up to 10,000 a day).
  STARTTLS is enforced on ports other than 465; the server greets with the host of
  `SUFFA_PUBLIC_URL`. Without SMTP the api still starts in prod but sign-in stays off; outside
  prod the link can go to the log for local testing.
- **Rate limits** (database storage): 5 sign-in mails per 10 minutes and client, 10 link
  openings per minute, 60 requests per minute on other auth routes.
- **Redirect guard:** Better Auth's own origin check is skipped under `NODE_ENV=test`, and we
  do not rely on it: every `callbackURL`, `errorCallbackURL` and `newUserCallbackURL` must be a
  path inside the app, in the request body and in the link (400 otherwise).
- **Keycloak:** Tabayyun already runs Keycloak. It has no built-in magic link, so Suffa keeps
  its own sign-in; single sign-on for teachers and admins via Keycloak (OIDC, generic OAuth)
  stays an option for later without changing student sign-in.

## Alternatives

- **Keycloak / Authentik / Zitadel** (separate IdP on CapRover): enterprise-grade, but another
  heavy service and OIDC plumbing for one app. Reconsider if schools need SSO (SAML/OIDC) —
  Better Auth's SSO plugin or an external IdP can be added later.
- **Lucia**: deprecated as a library. **Auth.js**: weaker fit outside Next.js.
- **Supabase Auth self-hosted**: pulls in GoTrue + Kong for one feature.

## Consequences

Auth lives in our codebase and DB (backups cover it). We own upgrades of the library. Rate
limits on auth routes and admin 2FA are mandatory acceptance criteria.
