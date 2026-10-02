# Releases

How a change becomes a version, and who hears about it.

## From pull request to staging

- Every pull request merges into `main` once CI is green and no blocking review finding is open.
- Every push to `main` runs the `release` workflow. It checks, builds, smoke-tests and scans the
  images, deploys them to staging (https://suffa.siralabs.org) and verifies that staging reports
  the new version (`sha-<short>`).
- Production stays a separate step that the owner approves (ADR-0024).

## Versions

- When a `release` run on `main` succeeds, the `github release` workflow
  (`.github/workflows/github-release.yml`) publishes a GitHub release with the next version and
  notes generated from the merged pull requests.
- The version is `v<major>.<minor>.<patch>`. The first release follows `v1.0.0`, the version in
  `package.json`.
  - **Patch** (`v1.0.1`): every merge that reaches staging.
  - **Minor** (`v1.1.0`): a merge whose commit message contains `[minor]`. It is used when a
    roadmap item (R1, R2, …) is complete.
  - **Major** (`v2.0.0`): a merge whose message contains `[major]`, only when the owner asks for
    it.
- A commit that already has a version tag is not released again.
- The workflow can also be run by hand ("Run workflow") to choose the part to raise.

## Who hears about it

- **Every published release:** an email to the owner. It says what is new, links to staging and
  the release, and says what to check.
- **Every minor or major release:** in addition, a short slide deck about the release and a
  one-hour calendar slot to walk through it, with the deck linked in the invitation.
