# ADR-0030: Nightly development without the owner in the loop

- Status: accepted (owner, 14 Nov 2026); the merge guard below is proposed by the first nightly
  run and waits for the owner
- Date: 2026-11-14
- Amends: `docs/ops/releases.md` (who merges), ADR-0024 (what a merge may reach)

## Context

Until October every change was planned with the owner, reviewed and merged by him. On
14 Nov 2026 the owner ordered that development continues without him: a nightly run picks the
next story from `docs/plan/sprint-plan.md`, delivers it and reports. Nobody reads along, so the
run cannot ask and must not wait.

## Decision

The owner's decisions of 14 Nov 2026. They override older notes in the repository.

- **No plan approval.** A run plans and implements straight away. A deviation from a spec or
  an ADR needs a new ADR in the same pull request, not a question.
- **The run merges.** Pull requests are opened ready for review with auto-merge enabled; where
  that is impossible, the run merges once every required check is green and every review
  thread is resolved. Never with a red or pending check.
- **One story per run**, in this order: get the run's own open pull requests merged and check
  that staging is healthy; look after dependency update pull requests (about a third of the
  run at most); take the first open, unblocked story in the plan's order; deliver it by the
  repository's conventions.
- **Never stall on the owner.** A story that needs something only the owner can give (a
  secret, an account, a store or developer account, teacher recordings, content or didactic
  review, a product decision) is blocked: one line starting `Owner:` under "Waiting on the
  owner" in the sprint plan says what is needed and why, and the run takes the next story.
  Where an earlier session left a question with a recommended answer, the run takes the
  recommendation and records it (an ADR if it is hard to reverse).
- **Limits, without exception:**
  - Staging only. Never production, TestFlight or a store; never a major release. The run
    never approves the `production` environment and never starts `deploy-production.yml`,
    `rollback-production.yml`, `ios-testflight.yml` or `github-release.yml` by hand.
  - Database migrations stay backward compatible with the version production runs.
  - No secrets in code, config, pull requests or logs; no learner data in tests, pull
    requests or logs.
  - No change to rulesets, branch protection, environments, repository settings, tokens or
    workflow permissions.
  - No test, eval or lint rule is skipped, disabled or weakened to get green; no force-push
    to `main`; nobody else's branch is rewritten.
  - Only this repository. An auth change is named in the run's summary so it can be ported
    to ʿArḍa (its ADR-0004).
- **Reporting.** Every run ends with a short German summary. On Sundays (Asia/Riyadh) the
  owner gets one mail with the open `Owner:` items and what waits for his production approval.

### Merge guard (proposed by the run of 14 Nov 2026)

"The run merges" rests on a merge reaching staging only, with production behind the owner's
approval. The run of 14 Nov 2026 found that this does not hold yet:

- `https://suffa.siralabs.org` reports the version the **staging** job of the last release
  deployed (`sha-f27948c`, release run 187 of 17 Oct 2026).
- In that run the job "promote to production" did not wait for an approval and skipped the
  deploy ("Production is not set up yet").
- The names `suffa.siralabs.org` and `suffa-stg.siralabs.org` resolve to the same address.
- Stories 2.7 to 2.9 (Sprint 2b) are open in the plan.

So a merge to `main` deploys, without any approval, to the site the owner describes as
production with real learners, and runs its migrations on their database.

Until the owner confirms that the site learners use is behind the approval (Sprint 2b done, or
`SUFFA_STAGING_URL` pointing at a separate staging), **a nightly run does not merge and does
not enable auto-merge**. It opens its pull requests ready for review, keeps them green, and
says so in the summary. This is the stricter reading of "staging only"; the owner lifts it
with one line in "Waiting on the owner".

## Consequences

- The plan (`docs/plan/sprint-plan.md`) is the single place for status, non-obvious decisions
  (one line each) and `Owner:` items.
- `CLAUDE.md` carries the commands and this agreement for every session.
- Review by a person is no longer a gate. CI, the browser tests, the image smoke tests and the
  scan are what stands between a change and staging, so a run adds tests with every change
  and never weakens one.
- While the merge guard holds, finished stories queue up as open pull requests. Later stories
  that build on them are stacked on their branches.
