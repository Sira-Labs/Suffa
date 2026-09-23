# ADR-0013: Deployment, CI/CD and operations on CapRover

- Status: proposed
- Date: 2026-09-23 (revised 2026-09-24: Tabayyun pattern, RustFS, no Redis)

## Context

Target platform is **CapRover** (Docker Swarm + nginx + Let's Encrypt) on a single EU VPS
initially, with room to add nodes.

## Decision

- **Mirror the Tabayyun deployment** on the same CapRover (`Tabayyun/deploy/caprover.md`):
  `arabictutor-web` (Caddy serving the PWA, proxying `/api` and `/media`), `arabictutor-api`,
  `arabictutor-worker` (api image, `SUFFA_ROLE=worker`), `arabictutor-db` (plain app,
  `pgvector/pgvector` pg17, pinned), and the **existing shared `rustfs`** (ADR-0017).
  No Redis (ADR-0020). Runbook: `docs/ops/caprover-deployment.md`.
- **Images built in CI**, not on the CapRover host: GitHub Actions → GHCR →
  `caprover/deploy-from-github@v2` with per-app tokens (`CAPROVER_APP_TOKEN_API|WEB|WORKER`),
  immutable `sha-<short>` tags. `captain-definition` files in `infra/caprover/` for the
  build-on-server alternative.
- **Environments:** `staging` and `production` as separate CapRover apps (`-stg` suffix), same
  images promoted by tag.
- **DB migrations** run as a pre-start step of `arabictutor-api` (drizzle migrate, idempotent,
  guarded by an advisory lock); the worker exits with code 3 until the schema matches.
- **Secrets** only as CapRover env vars with `SUFFA_` prefix (`SUFFA_DATABASE_URL`,
  `SUFFA_AUTH_SECRET`, `SUFFA_S3_*`, `SUFFA_GOOGLE_*`, …) plus provider keys
  (`ANTHROPIC_API_KEY`, `OPENROUTER_API_KEY`, `HF_TOKEN`). The API refuses to start in prod
  with placeholder or short secrets (as Tabayyun does).
- **Backups:** nightly `pg_dump` sidecar → off-box S3-compatible storage (e.g. Hetzner Storage
  Box / Backblaze B2), 30 daily + 12 monthly; monthly restore drill into staging.
- **Security:** Postgres and RustFS not exposed; CapRover dashboard behind strong password + 2FA;
  firewall 80/443/22 (+ Swarm ports only between nodes); unattended OS security updates.
- **Observability:** pino JSON logs, `/healthz` + `/readyz`, GlitchTip for errors, uptime check
  (e.g. Uptime Kuma), AI spend dashboard in admin panel.
- **Web hosting change:** served by our nginx, so the app can switch from `createHashRouter` to
  `createBrowserRouter` with SPA fallback.

## Alternatives

- Coolify / Dokku: comparable; user chose CapRover.
- Kubernetes: unnecessary at this scale.

## Consequences

One VPS runs everything cheaply; single-node is a SPOF — acceptable at this stage, mitigated by
backups and a documented restore (RTO 2 h, RPO 24 h). Scale-out path: add a Swarm worker node,
move Postgres to a managed/dedicated node.
