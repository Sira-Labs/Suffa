# ADR-0014: Content moves to a DB-backed CMS with versioned offline bundles

- Status: accepted (16.1 implemented; bundles follow in 16.2)
- Date: 2026-09-23 (accepted 2026-10-10)
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

## Implementation notes (story 16.1)

- One row per unit in `content_units` (`<course>/<unit>`, e.g. `bayna-yadayk/3`): the working
  `draft`, a `revision` that every save bumps, `state` draft → review → published, the revision a
  teacher checked, and `published`, the unit file learners will get (with `einheit` and
  `status`). Saves and steps name the revision they act on; a stale one answers 409.
- Roles: `content:review` (teachers and admins) reads, checks and sends back;
  `content:write` (admins, second factor) edits, submits and publishes. A teacher's check belongs
  to one revision: a later save makes it stale, and only a checked revision is published as
  `geprueft`.
- Seed: the API reads `apps/web/src/content/units/einheit-NN.json` at start-up and inserts units
  that are missing, as published; existing rows are never touched. The schema in
  `apps/api/src/content/schema.ts` mirrors the web types, and a test validates every seed file.
- Stable IDs: `content_ids` records every ID with its unit and kind; a save that uses another
  unit's ID is refused (422 `id_taken`). Removed IDs stay registered (the tombstones of 16.2).
- Medina lessons (ADR-0025) keep their own JSON for now; they move into the CMS once their
  shape is settled.
