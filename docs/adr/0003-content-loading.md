# ADR-0003: Static course content as versioned JSON with a glob loader

- Status: accepted
- Date: 2026-06-13

## Context

The course content (vocabulary, dialogues, verbs …) comes from "العربية بين يديك" Book 1 and is
organised by unit. It should **not** be synced (it is the same for all users and only
referenced), and new units should be addable **without code changes**.

## Decision

- Global content (meta, sources, nisba, verbs, minimal pairs) lives in `src/content/meta.json`.
- One file per unit: `src/content/units/einheit-NN.json` (vocabulary + dialogues).
- `src/content/index.ts` loads all unit files via `import.meta.glob(..., { eager })` and merges
  them. A new file is picked up automatically at build time.
- `contentVersion` in the meta file versions the content.
- Every vocabulary item, verb, … has a stable domain `id` that SRS cards point to via
  `contentRef`.

## Consequences

Editors add content purely through JSON. The app bundles all content at build time → fully
available offline. Drawback: content changes require a redeploy (acceptable; the "Inhalt
hinzufügen" (add content) form covers user-created vocabulary at runtime and syncs it).
