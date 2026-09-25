# ADR-0024: A separate production server; the current host becomes staging and tools

- Status: accepted (Sīra family decision, Arqam ADR-0020, 25 Sep 2026)
- Date: 2026-09-25
- Amends: ADR-0013 (deployment on CapRover)

## Context

ADR-0013 puts `staging` and `production` on one CapRover, as separate apps with a `-stg` suffix.
Today Suffa, Arqam and Tabayyun share that one Hetzner server, and the only people signed in are
the owner, family and friends. That makes this the cheapest moment to separate the two
environments, before real learners' data arrives.

With both environments on one host:

- **Failures are shared.** A staging experiment, a runaway transcode or a full disk takes down
  every project's production at once.
- **Personal data spreads.** Real learners' data sits next to test data, and restore drills into
  staging copy it there too.
- **Recovery is hard to reason about.** Backup, restore and access rules cannot differ between
  "must never be lost" and "can be rebuilt".

The Sīra family decided this for all three projects in Arqam's ADR-0020. This ADR applies it to
Suffa.

## Decision

- **Two independent CapRover servers at Hetzner:**
  - **Production** is a new server in Germany. It runs `suffa-web`, `suffa-api`,
    `suffa-worker`, `suffa-db` and `suffa-backup`, next to Arqam's and Tabayyun's production
    apps.
    - It runs **its own RustFS app** with the production buckets (`suffa-media`,
      `suffa-uploads`, `suffa-content`, `suffa`), under the same app name `rustfs`.
    - `srv-captain--*` names resolve only inside one CapRover. Keeping the app name means
      `SUFFA_S3_ENDPOINT=http://srv-captain--rustfs:9000` is the same on both servers.
  - **Staging and tools** is the current server. It runs `suffa-web-stg`, `suffa-api-stg`,
    `suffa-worker-stg`, `suffa-db-stg` and `suffa-backup-stg`. It also hosts GlitchTip (errors
    and uptime checks for both servers) and experiments. Tools live here so they keep working
    when production is down.
- **Data rule:** personal data of real people lives only on production. Staging holds test
  accounts and generated data.
  - Nothing is copied across: the owner, family and friends sign up again on production once
    it is live.
  - Their staging users, sessions, devices and learning records are then deleted (story 2.9).
- **Restore drills** restore production backups into a throwaway database **on the production
  server**, check it, time it, and drop it. Never into staging.
- **Backups of production Postgres** (story 2.8):
  - **Continuous WAL archiving** (WAL-G) on top of **physical base backups**: weekly full,
    daily delta, at least two fulls kept. WAL replays only onto a base backup, so the RPO of
    minutes rests on them.
  - **The nightly `pg_dump -Fc`** (`suffa-backup`) stays, as a portable, independently
    restorable copy.
  - **Storage:** both are **encrypted before upload** and go to S3-compatible object storage
    in **another Hetzner location** than the production server. The copy in the server's own
    RustFS is not a backup of the server.
- **Promotion, not rebuild** (`.github/workflows/release.yml`):
  - **Build once:** CI builds each image once, smoke-tests and scans it, and publishes exactly
    that image. It is pushed, not rebuilt.
  - **Staging:** every push to `main` deploys it by digest to the `-stg` apps. The workflow
    then checks that staging reports the new version.
  - **Production:** a separate job bound to the GitHub environment `production`, where the
    owner is the required reviewer. After approval it deploys the **same digests** to
    production. Nothing is rebuilt between staging and production.
- **Separate secrets and access:** production gets its own `SUFFA_AUTH_SECRET`, VAPID and FCM
  keys, Google OAuth client, RustFS keys, SMTP settings and CapRover app tokens.
  - The production tokens are environment secrets of `production` with their own names
    (`*_PROD`), so no staging job can see them.
  - If one is missing, the production job fails; it never falls back to a staging value.
  - `SUFFA_AUTH_SECRET` is also kept in the owner's password manager. It signs sessions and
    seals the stored Drive tokens and admin 2FA secrets; losing it signs everyone out and
    makes those unreadable.
- **Error tracking across servers:** GlitchTip stays on the staging and tools server. Production
  apps cannot reach `srv-captain--glitchtip`, so their DSNs use GlitchTip's public HTTPS address
  (or, later, a Hetzner private network between the two servers). GlitchTip's public domain
  therefore stays until then.
- **Access:** SSH by key only on both servers; firewall opens 80, 443 and 22 only. The CapRover
  dashboards use a strong password and 2FA. Unattended security updates on both.

## Alternatives

- **Keep one server, separate by app name (ADR-0013 as written):** free, but none of the
  problems above goes away.
- **One CapRover cluster with two nodes (Docker Swarm):** one dashboard, but staging and
  production share a control plane; a misconfiguration reaches both.
- **Managed Postgres:** less to operate, but pgvector support, cost and an extra subprocessor
  weigh more than the gain at this size. Revisit at scale.
- **Rebuild the image for production:** simpler workflow, but production would run an image
  nobody tested. A digest is exact.

## Consequences

- **What changes in ADR-0013:**
  - The environments section ("separate CapRover apps with a `-stg` suffix on one server") is
    replaced by the two servers above.
  - The backups section ("monthly restore drill into staging") is replaced by the backup and
    drill rules above.
  - Its RTO of 2 h / RPO of 24 h becomes RPO minutes (WAL) for production.
- **Release workflow:** `main` deploys only to `-stg` apps. Production is a separate, approved
  job that promotes the digests staging runs.
- **Runbook:** `docs/ops/caprover-deployment.md` describes both servers, the GitHub
  environments, the production secrets and GlitchTip over HTTPS.
- **The move:** the current apps without suffix become staging. Either create the `-stg` apps
  or point the staging app variables at the old names until then (runbook §6).
- **Owner tasks:**
  - order the production server;
  - sign Hetzner's data processing agreement;
  - choose the backup location;
  - create the `production` environment with a required reviewer;
  - point `suffa.siralabs.org` at the new server when production is live.
- **Cost:** one more server to pay for and patch.
