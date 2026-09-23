# ADR-0007: Replace Supabase Cloud with a self-hosted API + Postgres on CapRover

- Status: proposed
- Date: 2026-09-23
- Supersedes (partially): ADR-0004 (the interface stays; the default provider changes)

## Context

Requirements: self-hosting on **CapRover**, roles (admin/teacher/student), admin panel,
server-held LLM keys, quotas, video import jobs. Supabase gives auth + Postgres + RLS but not a
place for business logic with secrets, and the user wants to leave the cloud service.

Options for CapRover:

1. **Self-host Supabase** (docker-compose of ~10 services) — heavy, awkward on CapRover
   (not a single app), upgrades are painful.
2. **PocketBase** — single binary, great for small apps, but Go/JS-hooks split, weaker fit for
   complex RBAC, LLM streaming and job queues.
3. **Own TypeScript API (Hono) + Postgres + Redis** — full control, shares code with the PWA.

## Decision

Option 3. Components as CapRover apps: `suffa-api`, `suffa-worker`, `suffa-web`, one-click
Postgres 16 and Redis 7 (details in ADR-0013).

- New **`ApiSyncProvider`** implements the existing `SyncProvider` interface; the wire
  contract (`push`/`pull`, camelCase fields, `(user_id, id)` PK, LWW) is unchanged.
- `SupabaseSyncProvider` stays in the codebase until all users migrated, selected by env.

### Migration from Supabase

1. Export `auth.users` (id, email) and the five sync tables with `pg_dump --data-only`.
2. Import into the new DB, **preserving user UUIDs** so `user_id` FKs remain valid.
3. Users sign in once via magic link on the new domain (sessions do not migrate).
4. Clients: on first login with the new provider, the outbox is pushed as usual; the server's
   LWW merges any overlap. No client data loss because IndexedDB is the source of truth.
5. Keep Supabase read-only for 30 days, then delete the project.

## Alternatives

See Context. Supabase self-host remains a fallback if we ever need Realtime/Storage APIs.

## Consequences

More code we own (auth wiring, authz), but one language, one deploy target, and full data
sovereignty. Security that RLS gave for free must be re-implemented as server-side authz —
covered by integration tests (RBAC matrix) in Sprint 3.
