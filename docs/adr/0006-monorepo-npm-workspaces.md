# ADR-0006: Monorepo with npm workspaces (web, api, worker, shared packages)

- Status: proposed
- Date: 2026-09-23

## Context

We add a server (API + worker). Client and server must share types (sync records, DTOs), zod
schemas, the SRS engine and content validators. Two repos would drift.

## Decision

- Convert the repo to **npm workspaces**: `apps/web` (existing `src/` moved verbatim),
  `apps/api`, `apps/worker`, `packages/{shared,srs,llm,content}`.
- No extra build orchestrator initially; root scripts run `-ws`. Revisit Turborepo only if CI
  exceeds ~10 minutes.
- Path alias `@/` stays inside `apps/web`; cross-package imports use `@suffa/<pkg>`.

## Alternatives

- Separate API repo: simpler CI, but duplicated types and version skew.
- pnpm/Turborepo from day one: faster, but more moving parts than needed for a solo/small team.

## Consequences

One PR can change a contract end-to-end. The move is mechanical (git mv) and done in Sprint 1
before feature work to keep diffs reviewable.
