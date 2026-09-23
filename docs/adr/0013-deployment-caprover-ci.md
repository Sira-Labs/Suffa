# ADR-0013: Deployment, CI/CD and operations on CapRover

- Status: proposed
- Date: 2026-09-23

## Context

Target platform is **CapRover** (Docker Swarm + nginx + Let's Encrypt) on a single EU VPS
initially, with room to add nodes.

## Decision

- **Apps:** `suffa-web` (nginx serving the built PWA), `suffa-api`, `suffa-worker`,
  one-click `postgres:16` and `redis:7`, optional `minio` and `glitchtip`.
- **Images built in CI**, not on the CapRover host: GitHub Actions → GHCR → `caprover deploy
--imageName` with a per-app deploy token (GitHub secret). `captain-definition` files in
  `infra/caprover/` for manual deploys.
- **Environments:** `staging` and `production` as separate CapRover apps (`-stg` suffix), same
  images promoted by tag.
- **DB migrations** run as a pre-start step of `suffa-api` (drizzle-kit migrate, idempotent,
  guarded by an advisory lock).
- **Secrets** only as CapRover env vars (`DATABASE_URL`, `REDIS_URL`, `BETTER_AUTH_SECRET`,
  `ANTHROPIC_API_KEY`, `OPENROUTER_API_KEY`, `HF_TOKEN`, `YOUTUBE_API_KEY`, `SMTP_*`).
- **Backups:** nightly `pg_dump` sidecar → off-box S3-compatible storage (e.g. Hetzner Storage
  Box / Backblaze B2), 30 daily + 12 monthly; monthly restore drill into staging.
- **Security:** Postgres/Redis not exposed; CapRover dashboard behind strong password + 2FA;
  firewall 80/443/22 (+ Swarm ports only between nodes); unattended OS security updates.
- **Observability:** pino JSON logs, `/healthz` + `/readyz`, GlitchTip for errors, uptime check
  (e.g. Uptime Kuma one-click app), AI spend dashboard in admin panel.
- **Web hosting change:** served by our nginx, so the app can switch from `createHashRouter` to
  `createBrowserRouter` with SPA fallback.

## Alternatives

- Coolify / Dokku: comparable; user chose CapRover.
- Kubernetes: unnecessary at this scale.

## Consequences

One VPS runs everything cheaply; single-node is a SPOF — acceptable at this stage, mitigated by
backups and a documented restore (RTO 2 h, RPO 24 h). Scale-out path: add a Swarm worker node,
move Postgres to a managed/dedicated node.
