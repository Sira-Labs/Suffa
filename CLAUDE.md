# Suffa: notes for Claude sessions

Offline-first Arabic learning platform: a PWA (`apps/web`), an API and worker (`apps/api`),
browser tests (`apps/e2e`), shared packages (`packages/engagement`, `llm`, `phonology`), a
Capacitor shell (`mobile/`, outside the workspaces).

## Where things are

- Plan and backlog: `docs/plan/sprint-plan.md` (status, decisions, "Waiting on the owner"),
  `docs/plan/roadmap.md`.
- Specs: `docs/spec/`. Decisions: `docs/adr/` (index in `docs/README.md`).
- Operations: `docs/ops/` — read `docs/ops/releases.md` first.

## Commands (Node 22, from the repository root)

```sh
npm ci
npm run format:check        # prettier; `npm run format` fixes
npm run lint                # eslint; includes the rule against hard-coded UI text
npm run typecheck           # all workspaces
npm test                    # all workspaces + tools
npm test -w @suffa/api      # one workspace; also @suffa/web, @suffa/engagement, …
npm run build -w @suffa/api && npm run build -w @suffa/web
npm run e2e -w @suffa/e2e -- --trace off   # Playwright; needs both builds and Postgres
```

- API integration tests (`*.pg.integration.test.ts`) run only with
  `SUFFA_TEST_DATABASE_URL=postgres://…` and wipe that database. Without it they are skipped,
  so set it before calling a change tested.
- Migrations are plain SQL in `apps/api/migrations/NNNN_name.sql`, applied in order at API
  start. They must work with the previous release still running (add nullable columns or
  defaults; never drop or rename what the running version reads).
- UI text lives in `apps/web/src/i18n/locales/{de,en}`; both languages in the same change.

## Working agreement (ADR-0030, owner, 14 Nov 2026)

- Plan, then implement; no plan approval. A deviation from a spec or an ADR needs a new ADR
  in the same pull request.
- One story per run, the first open and unblocked one in the plan. Blocked on the owner: one
  `Owner:` line under "Waiting on the owner" in the sprint plan, then the next story.
- Spec or ADR first where needed, tests with the change, format, lint, typecheck and tests
  clean before each commit, semantic commit messages, a pull request. Mark the story in the
  sprint plan with one line per non-obvious decision.
- Merging: see the merge guard in ADR-0030. While it holds, open pull requests ready for
  review and do not merge. Once the owner lifts it: enable auto-merge, never merge with a red
  or pending check.
- Never: production, TestFlight, a store, a major release, approving the `production`
  environment, running `deploy-production.yml`, `rollback-production.yml`,
  `ios-testflight.yml` or `github-release.yml` by hand.
- Never: secrets or learner data in code, tests, pull requests or logs; changes to rulesets,
  branch protection, environments, settings, tokens or workflow permissions; skipping or
  weakening a test, eval or lint rule; force-pushing `main`; touching another repository.
- Auth is shared with ʿArḍa (its ADR-0004): name every auth change in the summary.
