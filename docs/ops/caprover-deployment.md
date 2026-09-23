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

Two templates live in `infra/caprover/one-click/`. In CapRover: **Apps → One-Click
Apps/Databases → `>> TEMPLATE <<`**, paste the file, enter the app name **`suffa`**, deploy.

| Template         | Creates                                              | Use when                                                                               |
| ---------------- | ---------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `suffa.yml`      | `suffa-web`, `suffa-db`                              | Just the offline app + database                                                        |
| `suffa-full.yml` | `suffa-db`, `suffa-api`, `suffa-worker`, `suffa-web` | **Recommended** — full stack (api is a skeleton: health, migrations, worker heartbeat) |

The images are built by `.github/workflows/release.yml` on every push to `main` and
published **publicly** on GHCR (`ghcr.io/thedatadudech/suffa-web`, `suffa-api`), so CapRover
needs no registry credentials. If a pull ever fails with `unauthorized`, open the package on
GitHub (Packages → suffa-web / suffa-api → Package settings) and set its visibility to public.
For deploying without GHCR, the root `captain-definition` builds the same image on the server
(method 3 in Tabayyun's guide).

## What to create

| #   | CapRover app          | Image                                          | Persistent data                                   | Public domain                   | Notes                                                                                |
| --- | --------------------- | ---------------------------------------------- | ------------------------------------------------- | ------------------------------- | ------------------------------------------------------------------------------------ |
| 1   | `suffa-db`            | `pgvector/pgvector:<pinned>-pg17`              | `/var/lib/postgresql/data` (label `suffa-pgdata`) | no                              | Plain app, not a one-click DB (needs pgvector). No host port.                        |
| 2   | `suffa-api`           | `ghcr.io/thedatadudech/suffa-api:<sha>`        | none                                              | optional                        | Runs DB migrations on start; refuses to start on placeholder secrets. Port **8000**. |
| 3   | `suffa-worker`        | same image as api                              | `/data/tmp` (scratch for transcodes)              | no                              | `SUFFA_ROLE=worker`. Has `ffmpeg`. Exits with code 3 until the api has migrated.     |
| 4   | `suffa-web`           | `ghcr.io/thedatadudech/suffa-web:<sha>`        | none                                              | **yes** (e.g. `suffa.<domain>`) | Caddy + PWA; proxies `/api`, `/healthz`, `/media`. Port **80**.                      |
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

| Name                                                                        | Value                                                                                                   | From sprint |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ----------- |
| `SUFFA_ENV`                                                                 | `prod`                                                                                                  | S1          |
| `SUFFA_PUBLIC_URL`                                                          | `https://suffa.<domain>`                                                                                | S1          |
| `SUFFA_DATABASE_URL`                                                        | `postgres://suffa:<password>@srv-captain--suffa-db:5432/suffa`                                          | S1          |
| `SUFFA_AUTH_SECRET`                                                         | `openssl rand -base64 48`                                                                               | S3          |
| `SUFFA_SYNC_DEV_TOKENS`                                                     | **never in prod** (the api refuses to start): `token=userUuid;…` for local/test sync before Better Auth | dev only    |
| `SUFFA_ENCRYPTION_KEY`                                                      | `openssl rand -base64 32` (encrypts Google refresh tokens)                                              | S7          |
| `SUFFA_SMTP_URL`                                                            | `smtps://user:pass@smtp.provider:465`                                                                   | S3          |
| `SUFFA_MAIL_FROM`                                                           | `Suffa <noreply@<domain>>`                                                                              | S3          |
| `SUFFA_S3_ENDPOINT`                                                         | `http://srv-captain--rustfs:9000`                                                                       | S7          |
| `SUFFA_S3_ALLOW_HTTP`                                                       | `true` (internal endpoint only)                                                                         | S7          |
| `SUFFA_S3_ACCESS_KEY_ID` / `SUFFA_S3_SECRET_ACCESS_KEY`                     | the `suffa-app` key                                                                                     | S7          |
| `SUFFA_S3_BUCKET_MEDIA` / `_UPLOADS` / `_CONTENT`                           | `suffa-media` / `suffa-uploads` / `suffa-content`                                                       | S7          |
| `SUFFA_MEDIA_PUBLIC_PREFIX`                                                 | `/media` (presigned URLs are rewritten to this same-origin path)                                        | S7          |
| `SUFFA_VAPID_PUBLIC_KEY` / `_PRIVATE_KEY` / `_SUBJECT`                      | `npx web-push generate-vapid-keys`; subject `mailto:you@<domain>`                                       | S6          |
| `SUFFA_GOOGLE_CLIENT_ID` / `_CLIENT_SECRET` / `SUFFA_GOOGLE_PICKER_API_KEY` | Google Cloud project (Drive API + Picker)                                                               | S7          |
| `SUFFA_YOUTUBE_API_KEY`                                                     | Google Cloud project (YouTube Data API v3)                                                              | S12         |
| `ANTHROPIC_API_KEY`, `OPENROUTER_API_KEY`, `HF_TOKEN`                       | provider keys                                                                                           | S9          |
| `SUFFA_FCM_SERVICE_ACCOUNT`                                                 | Firebase service-account JSON (base64)                                                                  | S13         |

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
2. Open `https://suffa.<domain>/healthz` → `{ "status": "ok", "db": "ok", "schemaRevision": "0002_users_and_sync_tables", "queue": { "waiting": 0, "active": 0, "failed": 0, "deadLetter": 0 } }`. A growing `waiting` count means the worker is down; `deadLetter` counts jobs that failed all retries. `/api/version` shows the deployed image tag.

## 8. Backups (`suffa-backup`)

Every night a small app takes a `pg_dump` of `suffa-db`, checks that it can be read back
(`pg_restore --list`), uploads it to the RustFS bucket `suffa` and checks the uploaded size.
Image: `ghcr.io/thedatadudech/suffa-backup` (scripts in `infra/backup/`).

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

## 9. Capacity with Tabayyun on the same server

Tabayyun's guidance is 2 vCPU / 4 GB for its api + web. Suffa adds roughly 1–1.5 GB RAM
(api, worker, Postgres). Transcoding is CPU-heavy: keep `SUFFA_TRANSCODE_CONCURRENCY=1`, and
if you choose `faster-whisper` in the worker, run transcription at night. Recommended: **8 GB
RAM / 4 vCPU** for both apps together; watch disk (RustFS holds recordings for both).

## Troubleshooting

| Symptom                                               | Cause                                                               | Fix                                                                                       |
| ----------------------------------------------------- | ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Web log `lookup srv-captain--suffa-api: no such host` | app name/upstream mismatch                                          | `SUFFA_API_UPSTREAM=srv-captain--<api app>:8000` (two dashes)                             |
| Media URLs return `SignatureDoesNotMatch`             | Host header not rewritten or endpoint differs between API and Caddy | Same value for `SUFFA_S3_ENDPOINT` host and `SUFFA_MEDIA_UPSTREAM`; keep `header_up Host` |
| Media `AccessDenied`                                  | key policy misses a bucket or `ListBucket`                          | Re-check policy in §2                                                                     |
| Worker exits code 3 repeatedly                        | api not yet migrated / version mismatch                             | Deploy api first; never run two api versions against one DB                               |
| API refuses to start in prod                          | placeholder or short secret                                         | Generate secrets as above, **Save & Update**                                              |
