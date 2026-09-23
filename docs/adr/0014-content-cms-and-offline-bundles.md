# ADR-0014: Content moves to a DB-backed CMS with versioned offline bundles

- Status: proposed
- Date: 2026-09-23
- Amends: ADR-0003

## Context

Content is bundled JSON (ADR-0003): great offline, but only developers can change it and every
change needs a redeploy. Teachers and admin must author vocab, dialogues and video checkpoints.

## Decision

- Source of truth for curriculum moves to Postgres (`content_units` with draft/review/published).
- **Publishing** creates an immutable, versioned **content bundle** (JSON, checksummed) served
  with long-lived caching at `/v1/content/bundle/:version`; `/v1/content/manifest` tells clients
  the latest version.
- The PWA ships the latest bundle at build time (so first run is offline-capable) and
  background-updates to newer bundles; stored in IndexedDB. Stable content IDs are preserved, so
  SRS `contentRef`s stay valid (IDs are never reused; removed items are tombstoned).
- The existing JSON files become the **seed** and the validation fixtures (`packages/content`).

## Alternatives

- Headless CMS (Strapi/Directus on CapRover): good editors, but another service and schema
  mapping for Arabic-specific structures (roots, wazn, conjugation tables).
- Keep JSON in git + PRs for teachers: unrealistic for non-developers.

## Consequences

Teachers can contribute without deploys; clients stay offline-first. Needs a schema validator
(already implied by types) and a small editor UI in the admin panel.
