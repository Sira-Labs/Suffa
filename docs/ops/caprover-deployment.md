# Deploying Suffa on CapRover (same pattern as Tabayyun)

Suffa is deployed exactly like Tabayyun (`thedatadudech/Tabayyun`, `deploy/caprover.md`):
images are built by GitHub Actions, published to GHCR, and deployed to CapRover apps with
app tokens. CapRover's nginx terminates TLS; the web app's Caddy serves the PWA and proxies
`/api` and `/media` over the internal network. Jobs run in a worker from the api image with a
Postgres queue (no Redis, ADR-0020). Files go to the **existing `rustfs` app** (ADR-0017).

```
Internet ─▶ CapRover nginx (TLS) ─▶ suffa-web (Caddy :80) ─/api───▶ suffa-api (:8000) ─┐
                                              │                                        ├─▶ suffa-db (Postgres 17 + pgvector)
                                              └─/media─▶ rustfs (:9000, shared)        │
                                                             ▲                         │
                                                  suffa-worker (api image, ROLE=worker)┘
```

> **Status:** `suffa-web` serves the full offline app; `suffa-api` is a skeleton (health,
> migrations, worker heartbeat) that grows sprint by sprint (`docs/plan/sprint-plan.md`).

## Quick start: one-click templates (YAML)

The templates live in `infra/caprover/one-click/`. In CapRover: **Apps → One-Click
Apps/Databases → `>> TEMPLATE <<`**, paste the file, enter the app name (**`suffa`**, or
**`glitchtip`** for the error tracker), deploy.

| Template           | Creates                                              | Use when                                                                     |
| ------------------ | ---------------------------------------------------- | ---------------------------------------------------------------------------- |
| `suffa.yml`        | `suffa-web`, `suffa-db`                              | Just the offline app + database                                              |
| `suffa-full.yml`   | `suffa-db`, `suffa-api`, `suffa-worker`, `suffa-web` | **Recommended** — full stack (health, migrations, sync endpoints, job queue) |
| `suffa-backup.yml` | `suffa-backup`                                       | Nightly verified backups into RustFS (§8)                                    |
| `glitchtip.yml`    | `glitchtip`, `glitchtip-db`                          | Error tracking and uptime checks (§9)                                        |

The images are built by `.github/workflows/release.yml` on every push to `main` and
published **publicly** on GHCR (`ghcr.io/sira-labs/suffa-web`, `suffa-api`), so CapRover
needs no registry credentials. If a pull ever fails with `unauthorized`, open the package on
GitHub (Packages → suffa-web / suffa-api / suffa-backup → Package settings) and set its
visibility to public. In a GitHub organization new packages start **private**: after the
first release there, make all three public once.
For deploying without GHCR, the root `captain-definition` builds the same image on the server
(method 3 in Tabayyun's guide).

## What to create

| #   | CapRover app          | Image                                          | Persistent data                                   | Public domain                   | Notes                                                                                |
| --- | --------------------- | ---------------------------------------------- | ------------------------------------------------- | ------------------------------- | ------------------------------------------------------------------------------------ |
| 1   | `suffa-db`            | `pgvector/pgvector:<pinned>-pg17`              | `/var/lib/postgresql/data` (label `suffa-pgdata`) | no                              | Plain app, not a one-click DB (needs pgvector). No host port.                        |
| 2   | `suffa-api`           | `ghcr.io/sira-labs/suffa-api:<sha>`            | none                                              | optional                        | Runs DB migrations on start; refuses to start on placeholder secrets. Port **8000**. |
| 3   | `suffa-worker`        | same image as api                              | `/data/tmp` (scratch for transcodes)              | no                              | `SUFFA_ROLE=worker`. Has `ffmpeg`. Exits with code 3 until the api has migrated.     |
| 4   | `suffa-web`           | `ghcr.io/sira-labs/suffa-web:<sha>`            | none                                              | **yes** (e.g. `suffa.<domain>`) | Caddy + PWA; proxies `/api`, `/healthz`, `/media`. Port **80**.                      |
| —   | `rustfs` (**exists**) | `rustfs/rustfs:1.0.0` (as pinned for Tabayyun) | existing                                          | no                              | Add buckets + a Suffa-only key (below).                                              |

Separate `suffa-db` rather than a second database inside `tabayyun-db`: the two apps then
upgrade, restart and restore independently.

## 1. `suffa-db`

- _Deploy via ImageName_: `pgvector/pgvector:<pinned tag>-pg17` (pin exactly; upgrade deliberately).
- Env: `POSTGRES_USER=suffa`, `POSTGRES_PASSWORD=<openssl rand -hex 24>`, `POSTGRES_DB=suffa`.
- Persistent directory `/var/lib/postgresql/data`, label `suffa-pgdata`. No port mapping.
- The API reaches it at `srv-captain--suffa-db:5432`.

## 2. RustFS: buckets and key (existing `rustfs` app)

In the RustFS console (open port 9001 temporarily or via SSH tunnel, as for Tabayyun):

1. Create buckets `suffa-media`, `suffa-uploads`, `suffa-content`.
2. Create access key `suffa-app` with this policy:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:GetObject",
        "s3:PutObject",
        "s3:DeleteObject",
        "s3:AbortMultipartUpload",
        "s3:ListMultipartUploadParts"
      ],
      "Resource": [
        "arn:aws:s3:::suffa-media/*",
        "arn:aws:s3:::suffa-uploads/*",
        "arn:aws:s3:::suffa-content/*"
      ]
    },
    {
      "Effect": "Allow",
      "Action": [
        "s3:ListBucket",
        "s3:GetBucketLocation",
        "s3:ListBucketMultipartUploads"
      ],
      "Resource": [
        "arn:aws:s3:::suffa-media",
        "arn:aws:s3:::suffa-uploads",
        "arn:aws:s3:::suffa-content"
      ]
    }
  ]
}
```

## 3. `suffa-api`

Env (App Configs → Environment variables):

| Name                                                                        | Value                                                                                                               | From sprint |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ----------- |
| `SUFFA_ENV`                                                                 | `prod`                                                                                                              | S1          |
| `SUFFA_PUBLIC_URL`                                                          | `https://suffa.<domain>`                                                                                            | S1          |
| `SUFFA_DATABASE_URL`                                                        | `postgres://suffa:<password>@srv-captain--suffa-db:5432/suffa`                                                      | S1          |
| `SUFFA_AUTH_SECRET`                                                         | `openssl rand -base64 48`                                                                                           | S3          |
| `SUFFA_ERROR_DSN`                                                           | DSN of the GlitchTip project `suffa-api` (§9); unset = no error reporting                                           | S2          |
| `SUFFA_WEB_ERROR_DSN`                                                       | DSN of the GlitchTip project `suffa-web` (§9), handed to the PWA via `/api/client-config`                           | S2          |
| `SUFFA_SYNC_DEV_TOKENS`                                                     | **never in prod** (the api refuses to start): `token=userUuid;…` for local/test sync before Better Auth             | dev only    |
| `SUFFA_SMTP_HOST`, `SUFFA_SMTP_PORT`                                        | `smtp-relay.gmail.com`, `587` – Google Workspace SMTP relay (§ Sign-in mails)                                       | S3          |
| `SUFFA_SMTP_USER`, `SUFFA_SMTP_PASSWORD`                                    | optional, only if the relay requires SMTP authentication (Workspace user + app password)                            | S3          |
| `SUFFA_TRUSTED_ORIGINS`                                                     | optional: further addresses the app is served from (e.g. the old domain), comma-separated                           | S5          |
| `SUFFA_VAPID_PUBLIC_KEY`, `SUFFA_VAPID_PRIVATE_KEY`                         | `npx web-push generate-vapid-keys` (once; keep them, new keys cancel every device's reminders)                      | S6          |
| `SUFFA_VAPID_SUBJECT`                                                       | `mailto:<ops address>` – contact for push services; reminders stay off until all three are set                      | S6          |
| `SUFFA_TRANSCRIBE_URL`                                                      | optional: OpenAI-compatible `/v1/audio/transcriptions` (OpenAI, Groq, self-hosted faster-whisper)                   | S8          |
| `SUFFA_TRANSCRIBE_TOKEN`, `SUFFA_TRANSCRIBE_MODEL`                          | API token (if the service needs one) and model, default `whisper-1`                                                 | S8          |
| `SUFFA_YOUTUBE_API_KEY`                                                     | optional: YouTube Data API v3 key (restrict it to the server IP) for the video catalog import; worker               | S12         |
| `SUFFA_ANTHROPIC_API_KEY`                                                   | optional: turns on Anthropic routes (AI gateway, ADR-0010); api and worker                                          | S9          |
| `SUFFA_OPENROUTER_API_KEY`                                                  | optional: turns on OpenRouter routes (open-weight models)                                                           | S9          |
| `SUFFA_HF_API_KEY`, `SUFFA_HF_ENDPOINT_URL`                                 | optional: Hugging Face token; endpoint URL for a dedicated Inference Endpoint (router otherwise)                    | S9          |
| GitHub secret `SUFFA_EVAL_ANTHROPIC_API_KEY`                                | optional, CI only: runs the AI evals (`.github/workflows/evals.yml`, ≤ $0.30 per run); use a key with a spend limit | S11         |
| `SUFFA_GOOGLE_CLIENT_ID`, `SUFFA_GOOGLE_CLIENT_SECRET`                      | OAuth web client (Google Cloud), redirect URI `https://<app>/api/v1/drive/callback`, scope `drive.file`             | S7          |
| `SUFFA_GOOGLE_API_KEY`, `SUFFA_GOOGLE_APP_ID`                               | browser API key (Picker API, restricted to the app's domain) and the project number                                 | S7          |
| `SUFFA_ENCRYPTION_KEY`                                                      | `openssl rand -base64 32` (encrypts Google refresh tokens)                                                          | S7          |
| `SUFFA_MAIL_FROM`                                                           | `Suffa <noreply@<domain>>` – any address of the Workspace domain                                                    | S3          |
| `SUFFA_S3_ENDPOINT`                                                         | `http://srv-captain--rustfs:9000`                                                                                   | S7          |
| `SUFFA_S3_ALLOW_HTTP`                                                       | `true` (internal endpoint only)                                                                                     | S7          |
| `SUFFA_S3_ACCESS_KEY_ID` / `SUFFA_S3_SECRET_ACCESS_KEY`                     | the `suffa-app` key                                                                                                 | S7          |
| `SUFFA_S3_BUCKET_MEDIA` / `_UPLOADS` / `_CONTENT`                           | `suffa-media` / `suffa-uploads` / `suffa-content`                                                                   | S7          |
| `SUFFA_MEDIA_PUBLIC_PREFIX`                                                 | `/media` (presigned URLs are rewritten to this same-origin path)                                                    | S7          |
| `SUFFA_VAPID_PUBLIC_KEY` / `_PRIVATE_KEY` / `_SUBJECT`                      | `npx web-push generate-vapid-keys`; subject `mailto:you@<domain>`                                                   | S6          |
| `SUFFA_GOOGLE_CLIENT_ID` / `_CLIENT_SECRET` / `SUFFA_GOOGLE_PICKER_API_KEY` | Google Cloud project (Drive API + Picker)                                                                           | S7          |
| `SUFFA_YOUTUBE_API_KEY`                                                     | Google Cloud project (YouTube Data API v3)                                                                          | S12         |
| `ANTHROPIC_API_KEY`, `OPENROUTER_API_KEY`, `HF_TOKEN`                       | provider keys                                                                                                       | S9          |
| `SUFFA_FCM_SERVICE_ACCOUNT`                                                 | Firebase service-account JSON (base64)                                                                              | S13         |

- Container HTTP port `8000`. HTTP settings: no public domain needed.
- Deployment tab → **Enable App Token** → GitHub secret `CAPROVER_APP_TOKEN_API`.

## 4. `suffa-worker`

- Same image and **same env** as `suffa-api`, plus `SUFFA_ROLE=worker`,
  `SUFFA_WORKER_CONCURRENCY=2`, `SUFFA_TRANSCODE_CONCURRENCY=1` (protects Tabayyun's CPU).
- Persistent directory `/data/tmp` (transcode scratch; cleaned by the worker).
- No HTTP settings. App token → `CAPROVER_APP_TOKEN_WORKER` (deploy step skipped until set).

## 5. `suffa-web`

- Env: `SUFFA_API_UPSTREAM=srv-captain--suffa-api:8000`,
  `SUFFA_MEDIA_UPSTREAM=srv-captain--rustfs:9000`.
- Container HTTP port `80`. Connect domain, **Enable HTTPS**, **Force HTTPS**.
- App token → `CAPROVER_APP_TOKEN_WEB`.

Caddyfile sketch (lives in `infra/caddy/Caddyfile`, mirrors Tabayyun's):

```caddy
:80 {
	encode zstd gzip
	header {
		Content-Security-Policy "default-src 'self'; script-src 'self' https://www.youtube.com https://apis.google.com; frame-src https://www.youtube-nocookie.com https://docs.google.com; img-src 'self' data: https://i.ytimg.com; media-src 'self' blob:; connect-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'"
		X-Content-Type-Options "nosniff"
		Referrer-Policy "strict-origin-when-cross-origin"
		Permissions-Policy "camera=(), microphone=(self), geolocation=()"
		-Server
	}
	@api path /api/* /healthz
	handle @api {
		reverse_proxy {$SUFFA_API_UPSTREAM}
	}
	# Presigned S3 URLs, signed by the API for the internal host; RustFS itself stays private.
	@media {
		path /media/*
		method GET HEAD PUT
	}
	handle @media {
		uri strip_prefix /media
		reverse_proxy {$SUFFA_MEDIA_UPSTREAM} {
			header_up Host {$SUFFA_MEDIA_UPSTREAM}
		}
	}
	handle {
		root * /srv
		try_files {path} /index.html
		file_server
	}
}
```

Uploads use multipart parts ≤ 64 MB. If you still see `413` from CapRover's nginx, raise
`client_max_body_size` in the `suffa-web` app's nginx config (HTTP Settings → Edit default
nginx configurations).

## 6. GitHub Actions (same names as Tabayyun)

| Kind     | Name                                          | Value                                                     |
| -------- | --------------------------------------------- | --------------------------------------------------------- |
| variable | `CAPROVER_SERVER`                             | `https://captain.<root-domain>` (same server as Tabayyun) |
| variable | `CAPROVER_APP_API` / `_WEB` / `_WORKER`       | `suffa-api` / `suffa-web` / `suffa-worker` (defaults)     |
| secret   | `CAPROVER_APP_TOKEN_API` / `_WEB` / `_WORKER` | app tokens from each app                                  |

The release workflow builds `suffa-api` and `suffa-web` images tagged `sha-<short>`, pushes
to GHCR, and deploys with `caprover/deploy-from-github@v2`. Every step is skipped while
`CAPROVER_SERVER` is unset.

## 7. Order of setup (first time)

1. `suffa-db` → 2. RustFS buckets + key → 3. `suffa-api` (first deploy by ImageName; watch log
   for `migrate.done`) → 4. `suffa-worker` → 5. `suffa-web` + domain + HTTPS → 6. GitHub
   variables/secrets → 7. push to `main` and confirm the three deploy steps.
2. Open `https://suffa.<domain>/healthz-web` → `{ "status": "ok", "role": "web", "version": "sha-…" }` (the web image), and `https://suffa.<domain>/healthz` → `{ "status": "ok", "db": "ok", "schemaRevision": "0002_users_and_sync_tables", "queue": { "waiting": 0, "active": 0, "failed": 0, "deadLetter": 0 } }`. A growing `waiting` count means the worker is down; `deadLetter` counts jobs that failed all retries. `/api/version` shows the deployed image tag.

## 8. Backups (`suffa-backup`)

Every night a small app takes a `pg_dump` of `suffa-db`, checks that it can be read back
(`pg_restore --list`), uploads it to the RustFS bucket `suffa` and checks the uploaded size.
Image: `ghcr.io/sira-labs/suffa-backup` (scripts in `infra/backup/`).

```
suffa/postgres/daily/YYYY/MM/suffa-<timestamp>.dump     every night
suffa/postgres/monthly/YYYY/suffa-<timestamp>.dump      additionally on the 1st
```

### 8.1 RustFS: bucket and write-only key

1. Bucket `suffa` with **versioning** and **object lock** (done).
2. Default retention (bucket → Object Lock): **Governance, 35 days** is a good start. Compliance
   mode is stricter (nobody can shorten it, not even the root user) but also cannot be undone.
3. If your RustFS version supports lifecycle rules: expire `postgres/daily/` after 35 days and
   `postgres/monthly/` after 400 days, and noncurrent versions after 35 days. Until then the
   bucket simply grows (a Suffa dump is small: kilobytes to a few MB).
4. Access key **`suffa-backup`** with this policy — it can write and read (for restores) but
   **cannot delete**, so a compromised server cannot wipe the backups:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:GetObject",
        "s3:AbortMultipartUpload",
        "s3:ListMultipartUploadParts"
      ],
      "Resource": ["arn:aws:s3:::suffa/postgres/*"]
    },
    {
      "Effect": "Allow",
      "Action": [
        "s3:ListBucket",
        "s3:GetBucketLocation",
        "s3:ListBucketMultipartUploads"
      ],
      "Resource": ["arn:aws:s3:::suffa"]
    }
  ]
}
```

### 8.2 Deploy

1. CapRover → One-Click Apps → `>> TEMPLATE <<` → paste
   `infra/caprover/one-click/suffa-backup.yml` → app name **`suffa`** → fill in the suffa-db
   password and the key's secret → Deploy. This creates the app `suffa-backup`.
2. `suffa-backup` → App Logs: within a minute `backup.done` with size, table count and SHA-256,
   then `backup.scheduled` with the next run (default 02:30 UTC).
3. Optional alerting: create an Uptime Kuma **push** monitor (interval 25 h) and put its URL
   into `SUFFA_BACKUP_PING_URL`; a missing or failed backup then raises an alert.
4. Automatic updates: Deployment → Enable App Token → GitHub secret `CAPROVER_APP_TOKEN_BACKUP`.

| Variable                                               | Default                      | Meaning                                                  |
| ------------------------------------------------------ | ---------------------------- | -------------------------------------------------------- |
| `SUFFA_BACKUP_DATABASE_URL`                            | —                            | `postgres://suffa:<pw>@srv-captain--suffa-db:5432/suffa` |
| `SUFFA_BACKUP_S3_ENDPOINT` / `_BUCKET`                 | —                            | `http://srv-captain--rustfs:9000` / `suffa`              |
| `SUFFA_BACKUP_S3_ACCESS_KEY_ID` / `_SECRET_ACCESS_KEY` | —                            | the `suffa-backup` key                                   |
| `SUFFA_BACKUP_S3_REGION`, `_PROVIDER`, `_PATH_STYLE`   | `us-east-1`, `Other`, `true` | for other S3 providers                                   |
| `SUFFA_BACKUP_PREFIX`                                  | `postgres`                   | folder inside the bucket                                 |
| `SUFFA_BACKUP_TIME_UTC`                                | `02:30`                      | daily run time                                           |
| `SUFFA_BACKUP_RUN_ON_START`                            | `false` (template: `true`)   | back up right after each start                           |
| `SUFFA_BACKUP_PING_URL`                                | —                            | monitoring push URL                                      |

Uploads carry `Content-MD5` on every request/part (required by object-lock buckets) and use
only PUT/GET/HEAD/list calls — verified against RustFS with object lock.

### 8.3 Restore drill (monthly)

Never restore into the live database; the script refuses when the target equals
`SUFFA_BACKUP_DATABASE_URL`.

```bash
# 1. scratch database
docker exec -it $(docker ps -q -f name=srv-captain--suffa-db) \
  psql -U suffa -c 'create database restore_drill'
# 2. restore the newest daily backup into it
docker exec -it $(docker ps -q -f name=srv-captain--suffa-backup) sh -c \
  'SUFFA_RESTORE_DATABASE_URL=${SUFFA_BACKUP_DATABASE_URL%/suffa}/restore_drill /opt/suffa-backup/restore.sh latest'
# 3. check, then drop the scratch database
docker exec -it $(docker ps -q -f name=srv-captain--suffa-db) \
  psql -U suffa -d restore_drill -c 'select count(*) from users; select count(*) from srs_cards'
docker exec -it $(docker ps -q -f name=srv-captain--suffa-db) psql -U suffa -c 'drop database restore_drill'
```

A specific backup: `restore.sh postgres/daily/2026/09/suffa-20260923T023000Z.dump`.

### 8.4 Off-site copy (recommended next)

RustFS on the same server protects against deletion and ransomware (object lock), but not
against losing the server. Add a second, off-site target (e.g. Hetzner Storage Box / Object
Storage, Backblaze B2) as soon as real learner data exists; recordings in `suffa-media` join
the backup when the recordings feature ships (ADR-0017).

## 9. Error tracking and uptime (GlitchTip)

GlitchTip is Sentry-compatible and runs on the same CapRover: one container (web + background
worker) plus its own Postgres, **no Redis**. Suffa sends errors only, never personal data:
no user info, cookies, headers, query strings or request bodies, and no session pings.

```
browser ──/api/errors──▶ suffa-api (tunnel: checks DSN, 256 KB cap, rate limit) ──▶ GlitchTip
suffa-api / suffa-worker ─────────────────────────────────────────────────────────▶ GlitchTip
```

The browser never talks to GlitchTip directly: ad blockers cannot drop the reports, the CSP
stays `connect-src 'self'`, and GlitchTip does not see learners' IP addresses.

### 9.1 Deploy GlitchTip

1. One-click → `>> TEMPLATE <<` → paste [`infra/caprover/one-click/glitchtip.yml`](../../infra/caprover/one-click/glitchtip.yml)
   → app name **`glitchtip`** → Deploy (creates `glitchtip` and `glitchtip-db`).
2. `glitchtip` → HTTP Settings → **Enable HTTPS** (and Force HTTPS).
3. Open `https://glitchtip.<root domain>` and **register right away**: registration is closed,
   only the very first account is allowed. Create the organization **Suffa**.
4. Check the app log: it must not mention `redis:6379`. If it does, CapRover dropped the empty
   variable: add `VALKEY_URL` with an empty value under App Configs and **Save & Update**.

### 9.2 Connect Suffa

1. In GlitchTip create two projects: **`suffa-api`** (platform Node.js) and **`suffa-web`**
   (platform Browser JavaScript). Each shows its DSN under Settings → Client Keys.
2. `suffa-api` → env: `SUFFA_ERROR_DSN=<DSN suffa-api>` and `SUFFA_WEB_ERROR_DSN=<DSN suffa-web>`.
3. `suffa-worker` → env: `SUFFA_ERROR_DSN=<DSN suffa-api>` (the `role` tag tells api and
   worker apart).
4. **Save & Update** both apps. The start log shows `"errorTracking":true`.

### 9.3 Verify (acceptance of story 2.4)

```bash
# a test error from the server, tagged with the deployed release (sha-…)
docker exec $(docker ps -q -f name=srv-captain--suffa-api) node dist/error-test.js
```

In GlitchTip → suffa-api: _"Suffa error tracking test (sha-…)"_ with release `sha-…`,
environment `prod` and tag `role: api`. For the browser, open the app, then in the browser
console run `setTimeout(() => { throw new Error('browser test') })`; it appears in
suffa-web with the same release.

### 9.4 Uptime checks and alerts

GlitchTip → Uptime Monitors → **New**:

| Name        | URL                                           | Interval | Expect |
| ----------- | --------------------------------------------- | -------- | ------ |
| Suffa       | `https://suffa-web.<root domain>/healthz`     | 60 s     | 200    |
| Suffa (PWA) | `https://suffa-web.<root domain>/healthz-web` | 5 min    | 200    |

`/healthz` answers 503 when the database is unreachable, the schema is behind or the job queue
is missing, so one monitor covers api, database and queue. Alerts: Project → Alerts → e-mail
(needs a real `EMAIL_URL`, e.g. `smtp+tls://user:password@smtp.example.com:587`) or a webhook
(Discord, Slack, ntfy …). Retention: 90 days by default (`GLITCHTIP_RETENTION_DAYS`).

GlitchTip's own database is **not** covered by `suffa-backup`; losing it only loses the error
history. Back it up the same way if you want to keep that.

### 9.5 Other projects (Tabayyun, …)

One GlitchTip serves all your apps. Per app: create a project in GlitchTip (Settings → Projects;
a second organization only if you want separate member lists), copy its DSN and add the
official Sentry SDK of the app's language. Nothing else changes on the server.

| App stack        | SDK                                  | Minimal setup                                                                    |
| ---------------- | ------------------------------------ | -------------------------------------------------------------------------------- |
| Python / FastAPI | `sentry-sdk`                         | `sentry_sdk.init(dsn=os.environ["SENTRY_DSN"], release=os.environ["VERSION"])`   |
| Node (plain)     | `@sentry/node`                       | `Sentry.init({ dsn: process.env.SENTRY_DSN, release })`                          |
| Browser / React  | `@sentry/browser` or `@sentry/react` | `Sentry.init({ dsn, release })`; a tunnel like Suffa's `/api/errors` is optional |

- Keep the DSN in the app's environment variables (never in the repo).
- Send `release` (the image tag) and `environment` so every error names the deployed version.
- Turn off personal data: Python `send_default_pii=False` (default); JavaScript v11
  `dataCollection` as in `apps/web/src/services/errorTracking.ts`.
- Add an uptime monitor per app (§9.4).
- Registration stays closed: invite other people from GlitchTip (Organization → Members).
  A second organization needs `ENABLE_ORGANIZATION_CREATION=True` for a moment (App Configs),
  then set it back to `False`.

## 10. Capacity with Tabayyun on the same server

Tabayyun's guidance is 2 vCPU / 4 GB for its api + web. Suffa adds roughly 1–1.5 GB RAM
(api, worker, Postgres). Transcoding is CPU-heavy: keep `SUFFA_TRANSCODE_CONCURRENCY=1`, and
if you choose `faster-whisper` in the worker, run transcription at night. Recommended: **8 GB
RAM / 4 vCPU** for both apps together; watch disk (RustFS holds recordings for both).
GlitchTip adds about 300–500 MB RAM (app + its Postgres) and a little disk for 90 days of events.

## Troubleshooting

| Symptom                                               | Cause                                                               | Fix                                                                                       |
| ----------------------------------------------------- | ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Web log `lookup srv-captain--suffa-api: no such host` | app name/upstream mismatch                                          | `SUFFA_API_UPSTREAM=srv-captain--<api app>:8000` (two dashes)                             |
| Media URLs return `SignatureDoesNotMatch`             | Host header not rewritten or endpoint differs between API and Caddy | Same value for `SUFFA_S3_ENDPOINT` host and `SUFFA_MEDIA_UPSTREAM`; keep `header_up Host` |
| Media `AccessDenied`                                  | key policy misses a bucket or `ListBucket`                          | Re-check policy in §2                                                                     |
| Worker exits code 3 repeatedly                        | api not yet migrated / version mismatch                             | Deploy api first; never run two api versions against one DB                               |
| No events in GlitchTip                                | DSN missing/wrong, or HTTPS not enabled on `glitchtip`              | Start log shows `"errorTracking":true`; run `node dist/error-test.js`; check the DSN      |
| Browser errors missing, server errors arrive          | `SUFFA_WEB_ERROR_DSN` unset or the DSN of the wrong project         | `https://<suffa>/api/client-config` must show the suffa-web DSN                           |
| GlitchTip log `redis:6379` connection refused         | empty `VALKEY_URL` was dropped                                      | Add `VALKEY_URL` with an empty value, **Save & Update**                                   |
| API refuses to start in prod                          | placeholder or short secret                                         | Generate secrets as above, **Save & Update**                                              |

## Sign-in mails (magic link)

Suffa signs people in with a link by email only (ADR-0008); there are no passwords. The api
sends the mails through the **Google Workspace SMTP relay**, the same setup as Tabayyun.

**1. Relay in the Workspace admin console** (admin.google.com → Apps → Google Workspace →
Gmail → Routing → **SMTP relay service** → Add another / edit the Tabayyun rule):

- _Allowed senders:_ "Only addresses in my domains".
- _Authentication:_ "Only accept mail from the specified IP addresses" with the public IP of the
  CapRover server, and/or "Require SMTP Authentication" (then a Workspace user with an app
  password is needed).
- _Encryption:_ "Require TLS encryption".

If Tabayyun's rule already allows the server's IP, Suffa can use it as is (same server).

**2. Environment of `suffa-api`** (App Configs → Environment variables):

| Name                                     | Value                                                                                      |
| ---------------------------------------- | ------------------------------------------------------------------------------------------ |
| `SUFFA_SMTP_HOST`                        | `smtp-relay.gmail.com`                                                                     |
| `SUFFA_SMTP_PORT`                        | `587` (STARTTLS, enforced; default) or `465` (implicit TLS). Many hosts block outgoing 465 |
| `SUFFA_MAIL_FROM`                        | `Suffa <noreply@your-domain>` – any address of the Workspace domain                        |
| `SUFFA_SMTP_USER`, `SUFFA_SMTP_PASSWORD` | only with "Require SMTP Authentication": the user and its app password                     |
| `SUFFA_PUBLIC_URL`                       | `https://suffa.<domain>`; its host name is also the relay greeting (EHLO)                  |
| `SUFFA_TRUSTED_ORIGINS`                  | optional: more addresses the app is served from, comma-separated (e.g. the old domain)     |

**3. Restart** the app. The log shows `auth.enabled` with `mail: smtp`. Without host and sender
it logs `auth.disabled`; the app keeps working offline, only sign-in and sync stay off.

The relay answers `550 5.7.0 Mail relay denied` when neither the IP rule nor authentication
matches, and `421 4.7.0 Try again later, closing connection. (EHLO)` when the server greets with
a name Google does not accept – Suffa greets with the host of `SUFFA_PUBLIC_URL`. Failed sends
are logged as `mail.send_failed` with host, port and the SMTP answer; `ETIMEDOUT` or `ESOCKET`
there means the outgoing port is blocked by the host (common for 465 and 25) – use `587`. A
sign-in request answered with `403 INVALID_ORIGIN` means `SUFFA_PUBLIC_URL` differs from the
address in the browser (or is missing from `SUFFA_TRUSTED_ORIGINS`); `auth.enabled` logs the
origins the api accepts. **Moving to a new domain:** set `SUFFA_PUBLIC_URL` to the new address
(sign-in mails and invite links point there) and list the old one in `SUFFA_TRUSTED_ORIGINS`
until nobody uses it. Browsers keep data and sign-in per domain: on the new address learners
sign in once more, and sync brings their progress over. Secrets live
only in CapRover, never in the repository. Outside prod the api may run without SMTP: the
sign-in link is then written to the log (`auth.magic_link_logged`) for local testing.
