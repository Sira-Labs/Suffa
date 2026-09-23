# ADR-0002: Offline-first sync with last-write-wins

- Status: accepted
- Date: 2026-06-13

## Context

A user's learning progress must be syncable across several devices (phone + desktop) while the
app works fully **offline**. Truly concurrent editing of the same record on two devices is rare.

## Decision

- **IndexedDB (Dexie) is the single source of truth** on the device. The UI reads and writes
  locally only.
- Every syncable record carries `id` (UUID or deterministic ID), `updated_at` (ISO) and
  `deleted` (soft-delete tombstone).
- **Persistent mutation queue (outbox)**: every local write creates an outbox entry. A sync
  cycle runs **push → pull → reconcile**.
- **Conflict resolution: last-write-wins per record** via `updated_at`
  (`src/services/sync/reconcile.ts`). The whole record wins; no field-level merge.
- Soft deletes take part in LWW like any other record (a newer edit can override an older
  deletion and vice versa).
- If push/pull fails, the outbox is kept → no data loss; the next cycle retries.

## Rationale for deterministic card IDs

SRS cards get the ID `kind:contentRef` (e.g. `vocab_ar_de:v-ism`). If two devices create the
same logical card before the first sync, they share the ID and are merged via LWW instead of
being duplicated. Since these IDs are only unique **per user**, the backend primary key is
`(user_id, id)` and the upsert uses `onConflict='user_id,id'`.

## Alternatives

- **CRDTs / operational merge**: more robust under true concurrency, but considerably more
  complex. Overkill for personal learning data.

## Consequences

Simple, predictable semantics. Theoretical drawback: with truly concurrent editing one change
(the older one) can be lost. Acceptable for single-user learning data.
