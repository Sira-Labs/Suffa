# ADR-0004: Swappable sync backend via a SyncProvider interface

- Status: accepted
- Date: 2026-06-13

## Context

Today we use Supabase (Auth + Postgres + RLS). For data-sovereignty reasons a self-hosted
backend (e.g. PocketBase) might be wanted later. The app must also run with no backend at all
(pure offline mode).

## Decision

- A **`SyncProvider` interface** (`src/services/sync/provider.ts`) encapsulates auth (magic
  link), `push` and `pull`. Errors are returned as `Result<T>` (no blind catch-all).
- Concrete implementations:
  - **`SupabaseSyncProvider`** — production, against Supabase.
  - **`NoopSyncProvider`** — pure offline mode without login.
- A **factory** (`factory.ts`) picks the provider based on the `.env` configuration. If the
  configuration is missing or `VITE_SYNC_ENABLED=false`, the noop provider is used.
- The `SyncEngine` is provider-agnostic (dependency injection via the constructor).

## Consequences

Switching backends = a new provider class, no changes to engine/stores/UI. The app is usable
offline immediately without any configuration; "Anmelden & hochladen" (sign in & upload)
becomes possible once a real provider is configured.
