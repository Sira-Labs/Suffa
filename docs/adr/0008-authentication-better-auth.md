# ADR-0008: Authentication with Better Auth (self-hosted)

- Status: proposed
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
  `arabictutor-web`'s Caddy proxies `/api` to the API (Tabayyun pattern), so no CORS and no
  third-party cookies. No tokens in `localStorage`. Native apps (ADR-0019) use Better Auth's
  bearer mode with the token in Keychain/Keystore.
- **Offline:** the PWA caches the last `/me` response (id, role, name) in IndexedDB to render
  the correct UI offline; any server call revalidates. Role-gated screens (admin/teacher) are
  hidden offline and always enforced server-side.
- Email delivery via SMTP env config.
- **Shared identity with Tabayyun (later, optional):** Tabayyun plans Keycloak/Zitadel (its
  ADR-0006). If that IdP goes live, Suffa adds it as an OIDC provider (Better Auth generic
  OAuth) for single sign-on for admins and teachers, without changing student login.

## Alternatives

- **Keycloak / Authentik / Zitadel** (separate IdP on CapRover): enterprise-grade, but another
  heavy service and OIDC plumbing for one app. Reconsider if schools need SSO (SAML/OIDC) —
  Better Auth's SSO plugin or an external IdP can be added later.
- **Lucia**: deprecated as a library. **Auth.js**: weaker fit outside Next.js.
- **Supabase Auth self-hosted**: pulls in GoTrue + Kong for one feature.

## Consequences

Auth lives in our codebase and DB (backups cover it). We own upgrades of the library. Rate
limits on auth routes and admin 2FA are mandatory acceptance criteria.
