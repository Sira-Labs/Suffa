# Suffa — Sprint Plan (S1–S14)

Two-week sprints; estimates in story points (1 pt ≈ half a day). Target ≈ 20 pts/sprint.
**Definition of Done (every story):** code + tests (unit/integration as relevant) · lint,
typecheck, test green in CI · docs/ADR updated · deployed to staging · acceptance criteria
demoed · no secrets in code · structured logs on new paths.

---

## P0 — Foundation

### Sprint 1 (Oct 5 – Oct 18) — _"New home, same app"_

Goal: repo ready for multi-app development; CI protects `main`.

| #   | Story                                                                                                           | Pts | Acceptance                                                               |
| --- | --------------------------------------------------------------------------------------------------------------- | --- | ------------------------------------------------------------------------ |
| 1.1 | Convert to npm workspaces; move `src/` → `apps/web`, SRS → `packages/srs`, types → `packages/shared` (ADR-0006) | 5   | All 44 existing tests pass from root; `npm run build` produces same PWA. |
| 1.2 | GitHub Actions: install (cache), lint, typecheck, test, build on PR + main                                      | 3   | PR blocked when any step fails.                                          |
| 1.3 | `apps/api` skeleton: Hono, pino logger w/ request id, zod env validation, `/healthz` `/readyz`                  | 3   | Starts with invalid env → fails fast with clear message.                 |
| 1.4 | Drizzle + Postgres: migrations for existing 5 sync tables (+ `users`)                                           | 3   | `drizzle-kit migrate` idempotent; integration test via Testcontainers.   |
| 1.5 | Dockerfiles for web (nginx, SPA fallback, CSP) and api                                                          | 3   | Images < 200 MB; run locally with `docker compose`.                      |
| 1.6 | Provision VPS + CapRover, domains, TLS; staging apps                                                            | 3   | `https://stg.<domain>` serves the PWA.                                   |

### Sprint 2 (Oct 19 – Nov 1) — _"Operable"_

| #   | Story                                                                                      | Pts | Acceptance                                                      |
| --- | ------------------------------------------------------------------------------------------ | --- | --------------------------------------------------------------- |
| 2.1 | CI deploy: build → GHCR → `caprover deploy` to staging on main; manual promote to prod     | 5   | Deploy < 10 min; rollback = redeploy previous tag.              |
| 2.2 | Postgres + Redis one-click apps, private networking, nightly `pg_dump` to off-box S3       | 3   | Backup file appears nightly; restore drill documented & passed. |
| 2.3 | GlitchTip + Uptime Kuma; web+api error reporting                                           | 3   | Thrown test error visible with release tag.                     |
| 2.4 | Switch to `createBrowserRouter` (served by nginx)                                          | 2   | Deep links and offline navigation work; Lighthouse PWA pass.    |
| 2.5 | Sync endpoints `POST /v1/sync/:table/push`, `GET /pull` (temporary API-key auth for tests) | 5   | Server contract test passes against the existing engine suite.  |
| 2.6 | Ops runbook (`docs/ops/runbook.md`)                                                        | 2   | Covers deploy, rollback, restore, secrets rotation.             |

**Gate G0.**

## P1 — Identity & roles

### Sprint 3 (Nov 2 – Nov 15) — _"Who are you?"_

| #   | Story                                                                             | Pts | Acceptance                                                                 |
| --- | --------------------------------------------------------------------------------- | --- | -------------------------------------------------------------------------- |
| 3.1 | Better Auth: magic link + email/password + passkeys; SMTP; rate limits (ADR-0008) | 5   | Sign-in on two devices; brute-force limited; tokens never in localStorage. |
| 3.2 | Roles & policies module `authz/` + route middleware (ADR-0009)                    | 5   | Table-driven route×role test green.                                        |
| 3.3 | `ApiSyncProvider` + factory selection by env; sync bound to session user          | 5   | Existing sync integration suite passes against it.                         |
| 3.4 | Settings → Konto UI: sign-in methods, sessions list, sign-out others              | 3   | Revoked session fails within 60 s.                                         |
| 3.5 | Security review of auth + sync                                                    | 2   | Findings fixed or ticketed.                                                |

### Sprint 4 (Nov 16 – Nov 29) — _"Admin & migration"_

| #   | Story                                                                                | Pts | Acceptance                                                       |
| --- | ------------------------------------------------------------------------------------ | --- | ---------------------------------------------------------------- |
| 4.1 | Supabase → Postgres migration script (preserve UUIDs), dry run on staging (ADR-0007) | 5   | Row counts & checksums match; users sign in and see their cards. |
| 4.2 | Admin panel shell `/admin` (lazy-loaded chunk), role-guarded                         | 3   | Non-admins get 403 from API and never download the chunk.        |
| 4.3 | Admin: users list (search, keyset pagination), change role, disable, audit log view  | 5   | Every change appears in audit log.                               |
| 4.4 | Admin 2FA mandatory                                                                  | 2   | Admin without 2FA is forced to enrol.                            |
| 4.5 | GDPR: export my data, delete account                                                 | 3   | Export JSON contains all sync tables; delete cascades.           |
| 4.6 | Production cut-over; Supabase read-only                                              | 2   | 1 week with no data-loss reports → **G1**.                       |

## P2 — AI teacher MVP

### Sprint 5 (Nov 30 – Dec 13) — _"Gateway"_

| #   | Story                                                                                            | Pts | Acceptance                                                                               |
| --- | ------------------------------------------------------------------------------------------------ | --- | ---------------------------------------------------------------------------------------- |
| 5.1 | `packages/llm`: interfaces, `AnthropicProvider` (official SDK, streaming, caching, typed errors) | 5   | Recorded-fixture tests; cache read tokens > 0 on 2nd call.                               |
| 5.2 | `OpenRouterProvider` + `HuggingFaceProvider`                                                     | 5   | Same contract suite passes for all 3 adapters.                                           |
| 5.3 | `ModelRouter` + `ai_model_routes` table + capability checks + fallbacks                          | 3   | Route change takes effect in ≤ 60 s without deploy.                                      |
| 5.4 | Metering + quotas (Redis counters, `ai_usage_daily`), budget downgrade logic                     | 5   | Over-quota user gets 429 with friendly message; spend reconciles to provider usage ±5 %. |

### Sprint 6 (Dec 14 – Dec 27) — _"al-Muʿallim speaks"_ (holiday-reduced: 15 pts)

| #   | Story                                                                                       | Pts | Acceptance                                           |
| --- | ------------------------------------------------------------------------------------------- | --- | ---------------------------------------------------- |
| 6.1 | Tutor API: conversations, SSE message streaming, curriculum pack + learner snapshot builder | 5   | First token p50 < 1.5 s on staging.                  |
| 6.2 | Tutor tools: `lookup_vocab`, `get_root_family`, `get_learner_state` (authz-checked)         | 3   | Tool cannot access another user's data (test).       |
| 6.3 | Tutor UI module (`modules/tutor`): chat, ArabicText rendering, tashkīl level, offline state | 5   | Works on mobile; RTL correct; 👍/👎 feedback stored. |
| 6.4 | Output validators (tashkīl coverage, schema, safety) + repair retry                         | 2   | Unit-tested with fixtures.                           |

### Sprint 7 (Dec 28 – Jan 10) — _"Grading & evals"_

| #   | Story                                                                      | Pts | Acceptance                                                         |
| --- | -------------------------------------------------------------------------- | --- | ------------------------------------------------------------------ |
| 7.1 | Grade mode for Writing module (structured rubric, error categories)        | 5   | Mistakes create SRS cards via `propose_srs_cards` + outbox.        |
| 7.2 | Drill mode: `make_exercise` renders in existing components                 | 5   | Exercises use only known + due vocab (test).                       |
| 7.3 | Eval harness: golden sets (explain, grade), CI job with budget cap         | 5   | Report posted as CI artifact; regression fails the job.            |
| 7.4 | Admin AI page: routes, prompts (versioned), spend dashboard, flagged chats | 5   | Admin changes model per task; spend per day/user visible. → **G2** |

## P3 — Interactive video

### Sprint 8 (Jan 11 – Jan 24) — _"Catalog"_

| #   | Story                                                                       | Pts | Acceptance                                                                     |
| --- | --------------------------------------------------------------------------- | --- | ------------------------------------------------------------------------------ |
| 8.1 | Video schema + worker import job (YouTube Data API v3, nightly + on demand) | 5   | Importing the al-Andalusi channel/playlists fills catalog; quota usage logged. |
| 8.2 | Admin video catalog: map video → unit, status, permission status            | 3   | Filter by unit/status; audit-logged.                                           |
| 8.3 | Lesson player (IFrame API, nocookie), segments, 0.75× + replay              | 5   | Works on iOS Safari & Android Chrome.                                          |
| 8.4 | Outreach: permission request to Muhammad al-Andalusi (PO task)              | 1   | Status recorded in catalog.                                                    |
| 8.5 | `video_progress` sync table (client + server)                               | 3   | Progress syncs across devices.                                                 |

### Sprint 9 (Jan 25 – Feb 7) — _"Interactive"_

| #   | Story                                                                    | Pts | Acceptance                                        |
| --- | ------------------------------------------------------------------------ | --- | ------------------------------------------------- |
| 9.1 | Checkpoint engine (pause at t, render mcq/dictation/vocab_flash, resume) | 5   | ±0.5 s trigger accuracy; results saved.           |
| 9.2 | Timeline editor for checkpoints (admin/teacher)                          | 5   | Add/edit/reorder at current time.                 |
| 9.3 | Transcript pane + tap-to-gloss + add-to-SRS (gated by permission)        | 5   | Hidden when not licensed.                         |
| 9.4 | "Ask al-Muʿallim about this minute"                                      | 3   | Segment context included; answer cites timestamp. |
| 9.5 | AI-suggested checkpoints (human approval)                                | 2   | Suggestions never auto-published. → **G3**        |

## P4 — Teacher workspace

### Sprint 10 (Feb 8 – Feb 21) — _"Classes"_

| #    | Story                                                                            | Pts | Acceptance                                 |
| ---- | -------------------------------------------------------------------------------- | --- | ------------------------------------------ |
| 10.1 | Classes, invite codes/links, membership approval                                 | 5   | Student joins via link; teacher sees them. |
| 10.2 | Class dashboard: activity, mastery per unit, leech words (aggregates, paginated) | 5   | Teacher sees only own classes (RBAC test). |
| 10.3 | Per-class AI settings (limits, allowed modes, minors flag)                       | 3   | Router honours class settings.             |
| 10.4 | Assignments: create (units, exam formats, videos, tutor scenario), due dates     | 5   | Students see assignments on Dashboard.     |

### Sprint 11 (Feb 22 – Mar 7) — _"Review & author"_

| #    | Story                                                              | Pts | Acceptance                                                             |
| ---- | ------------------------------------------------------------------ | --- | ---------------------------------------------------------------------- |
| 11.1 | Submissions + AI-graded review queue with teacher override         | 5   | Overrides stored and exported as eval cases.                           |
| 11.2 | Content CMS: units/vocab/dialogues draft→review→publish (ADR-0014) | 8   | Publish creates bundle; clients update in background; SRS refs intact. |
| 11.3 | Notifications (email digest for due assignments)                   | 3   | Opt-out respected.                                                     |
| 11.4 | Teacher pilot onboarding guide                                     | 1   | → **G4**                                                               |

## P5 — Next level

### Sprint 12 (Mar 8 – Mar 21) — _"Speak"_

Server STT via HF Whisper + pronunciation scoring (ADR-0015) · shadowing checkpoints use it ·
voice input for tutor · audio retention rules.

### Sprint 13 (Mar 22 – Apr 4) — _"Remember better"_

FSRS scheduler behind `schedule()` with per-user migration + A/B flag · Batch-generated drills
for all units (teacher-reviewed) · Book 1 units 4–16 content entry via CMS.

### Sprint 14 (Apr 5 – Apr 18) — _"Polish"_

English UI (i18n extraction) · opt-in leaderboards, weekly goals, unit certificates ·
accessibility audit (WCAG 2.2 AA) · performance budget · `v2.2` release.

---

## Backlog (unscheduled)

Arabic UI (full RTL chrome) · Book 2 · SSO for schools (OIDC/SAML) · Capacitor wrapper for app
stores · multi-node Swarm · pgvector RAG over all transcripts · parent accounts for minors.
