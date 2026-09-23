# Deploying Suffa on CapRover (same pattern as Tabayyun)

Suffa is deployed exactly like Tabayyun (`thedatadudech/Tabayyun`, `deploy/caprover.md`):
images are built by GitHub Actions, published to GHCR, and deployed to CapRover apps with
app tokens. CapRover's nginx terminates TLS; the web app's Caddy serves the PWA and proxies
`/api` and `/media` over the internal network. Jobs run in a worker from the api image with a
Postgres queue (no Redis, ADR-0020). Files go to the **existing `rustfs` app** (ADR-0017).

```
Internet ─▶ CapRover nginx (TLS) ─▶ arabictutor-web (Caddy :80) ─/api───▶ arabictutor-api (:8000) ─┐
                                              │                                        ├─▶ arabictutor-db (Postgres 17 + pgvector)
                                              └─/media─▶ rustfs (:9000, shared)        │
                                                             ▲                         │
                                                  arabictutor-worker (api image, ROLE=worker)┘
```

> **Status:** the api/worker images arrive in Sprints 1–2 (`docs/plan/sprint-plan.md`). Until
> then only `arabictutor-web` (the current offline PWA, static) can be deployed. The steps below are
> the target setup.

## Quick start: one-click templates (YAML)

> **Names:** another app called Suffa already runs on this CapRover (`suffa-*` apps). This
> project therefore uses the technical prefix **`arabictutor`** everywhere: CapRover apps
> (`arabictutor-web`, `-db`, `-api`, `-worker`), GHCR images, RustFS buckets and key, and the
> Postgres user. Never deploy these templates with the app name `suffa`.

Two templates live in `infra/caprover/one-click/`. In CapRover: **Apps → One-Click
Apps/Databases → `>> TEMPLATE <<`**, paste the file, enter the app name **`arabictutor`**, deploy.

| Template               | Creates                                                                      | Use when                                               |
| ---------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------ |
| `arabictutor.yml`      | `arabictutor-web`, `arabictutor-db`                                          | **Now** — offline PWA + database (api not built yet)   |
| `arabictutor-full.yml` | `arabictutor-db`, `arabictutor-api`, `arabictutor-worker`, `arabictutor-web` | From Sprint 2, once the `arabictutor-api` image exists |

Before the first deploy: the repository is **private**, so its GHCR images are private too.
Either add `ghcr.io` under **Cluster → Docker Registries** (GitHub user + token with
`read:packages`) or make the packages public. The `arabictutor-web` image is built by
`.github/workflows/release.yml` on every push to `main`. For deploying without GHCR, the
root `captain-definition` builds the same image on the server (method 3 in Tabayyun's guide).

## What to create

| #   | CapRover app          | Image                                          | Persistent data                                         | Public domain                         | Notes                                                                                |
| --- | --------------------- | ---------------------------------------------- | ------------------------------------------------------- | ------------------------------------- | ------------------------------------------------------------------------------------ |
| 1   | `arabictutor-db`      | `pgvector/pgvector:<pinned>-pg17`              | `/var/lib/postgresql/data` (label `arabictutor-pgdata`) | no                                    | Plain app, not a one-click DB (needs pgvector). No host port.                        |
| 2   | `arabictutor-api`     | `ghcr.io/thedatadudech/arabictutor-api:<sha>`  | none                                                    | optional                              | Runs DB migrations on start; refuses to start on placeholder secrets. Port **8000**. |
| 3   | `arabictutor-worker`  | same image as api                              | `/data/tmp` (scratch for transcodes)                    | no                                    | `SUFFA_ROLE=worker`. Has `ffmpeg`. Exits with code 3 until the api has migrated.     |
| 4   | `arabictutor-web`     | `ghcr.io/thedatadudech/arabictutor-web:<sha>`  | none                                                    | **yes** (e.g. `arabictutor.<domain>`) | Caddy + PWA; proxies `/api`, `/healthz`, `/media`. Port **80**.                      |
| —   | `rustfs` (**exists**) | `rustfs/rustfs:1.0.0` (as pinned for Tabayyun) | existing                                                | no                                    | Add buckets + a Suffa-only key (below).                                              |

Separate `arabictutor-db` rather than a second database inside `tabayyun-db`: the two apps then
upgrade, restart and restore independently.

## 1. `arabictutor-db`

- _Deploy via ImageName_: `pgvector/pgvector:<pinned tag>-pg17` (pin exactly; upgrade deliberately).
- Env: `POSTGRES_USER=arabictutor`, `POSTGRES_PASSWORD=<openssl rand -hex 24>`, `POSTGRES_DB=arabictutor`.
- Persistent directory `/var/lib/postgresql/data`, label `arabictutor-pgdata`. No port mapping.
- The API reaches it at `srv-captain--arabictutor-db:5432`.

## 2. RustFS: buckets and key (existing `rustfs` app)

In the RustFS console (open port 9001 temporarily or via SSH tunnel, as for Tabayyun):

1. Create buckets `arabictutor-media`, `arabictutor-uploads`, `arabictutor-content`.
2. Create access key `arabictutor-app` with this policy:

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
        "arn:aws:s3:::arabictutor-media/*",
        "arn:aws:s3:::arabictutor-uploads/*",
        "arn:aws:s3:::arabictutor-content/*"
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
        "arn:aws:s3:::arabictutor-media",
        "arn:aws:s3:::arabictutor-uploads",
        "arn:aws:s3:::arabictutor-content"
      ]
    }
  ]
}
```

## 3. `arabictutor-api`

Env (App Configs → Environment variables):

| Name                                                                        | Value                                                                            | From sprint |
| --------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | ----------- |
| `SUFFA_ENV`                                                                 | `prod`                                                                           | S1          |
| `SUFFA_PUBLIC_URL`                                                          | `https://arabictutor.<domain>`                                                   | S1          |
| `SUFFA_DATABASE_URL`                                                        | `postgres://arabictutor:<password>@srv-captain--arabictutor-db:5432/arabictutor` | S1          |
| `SUFFA_AUTH_SECRET`                                                         | `openssl rand -base64 48`                                                        | S3          |
| `SUFFA_ENCRYPTION_KEY`                                                      | `openssl rand -base64 32` (encrypts Google refresh tokens)                       | S7          |
| `SUFFA_SMTP_URL`                                                            | `smtps://user:pass@smtp.provider:465`                                            | S3          |
| `SUFFA_MAIL_FROM`                                                           | `Suffa <noreply@<domain>>`                                                       | S3          |
| `SUFFA_S3_ENDPOINT`                                                         | `http://srv-captain--rustfs:9000`                                                | S7          |
| `SUFFA_S3_ALLOW_HTTP`                                                       | `true` (internal endpoint only)                                                  | S7          |
| `SUFFA_S3_ACCESS_KEY_ID` / `SUFFA_S3_SECRET_ACCESS_KEY`                     | the `arabictutor-app` key                                                        | S7          |
| `SUFFA_S3_BUCKET_MEDIA` / `_UPLOADS` / `_CONTENT`                           | `arabictutor-media` / `arabictutor-uploads` / `arabictutor-content`              | S7          |
| `SUFFA_MEDIA_PUBLIC_PREFIX`                                                 | `/media` (presigned URLs are rewritten to this same-origin path)                 | S7          |
| `SUFFA_VAPID_PUBLIC_KEY` / `_PRIVATE_KEY` / `_SUBJECT`                      | `npx web-push generate-vapid-keys`; subject `mailto:you@<domain>`                | S6          |
| `SUFFA_GOOGLE_CLIENT_ID` / `_CLIENT_SECRET` / `SUFFA_GOOGLE_PICKER_API_KEY` | Google Cloud project (Drive API + Picker)                                        | S7          |
| `SUFFA_YOUTUBE_API_KEY`                                                     | Google Cloud project (YouTube Data API v3)                                       | S12         |
| `ANTHROPIC_API_KEY`, `OPENROUTER_API_KEY`, `HF_TOKEN`                       | provider keys                                                                    | S9          |
| `SUFFA_FCM_SERVICE_ACCOUNT`                                                 | Firebase service-account JSON (base64)                                           | S13         |

- Container HTTP port `8000`. HTTP settings: no public domain needed.
- Deployment tab → **Enable App Token** → GitHub secret `CAPROVER_APP_TOKEN_API`.

## 4. `arabictutor-worker`

- Same image and **same env** as `arabictutor-api`, plus `SUFFA_ROLE=worker`,
  `SUFFA_WORKER_CONCURRENCY=2`, `SUFFA_TRANSCODE_CONCURRENCY=1` (protects Tabayyun's CPU).
- Persistent directory `/data/tmp` (transcode scratch; cleaned by the worker).
- No HTTP settings. App token → `CAPROVER_APP_TOKEN_WORKER` (deploy step skipped until set).

## 5. `arabictutor-web`

- Env: `SUFFA_API_UPSTREAM=srv-captain--arabictutor-api:8000`,
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
`client_max_body_size` in the `arabictutor-web` app's nginx config (HTTP Settings → Edit default
nginx configurations).

## 6. GitHub Actions (same names as Tabayyun)

| Kind     | Name                                          | Value                                                                   |
| -------- | --------------------------------------------- | ----------------------------------------------------------------------- |
| variable | `CAPROVER_SERVER`                             | `https://captain.<root-domain>` (same server as Tabayyun)               |
| variable | `CAPROVER_APP_API` / `_WEB` / `_WORKER`       | `arabictutor-api` / `arabictutor-web` / `arabictutor-worker` (defaults) |
| secret   | `CAPROVER_APP_TOKEN_API` / `_WEB` / `_WORKER` | app tokens from each app                                                |

The release workflow builds `arabictutor-api` and `arabictutor-web` images tagged `sha-<short>`, pushes
to GHCR, and deploys with `caprover/deploy-from-github@v2`. Every step is skipped while
`CAPROVER_SERVER` is unset.

## 7. Order of setup (first time)

1. `arabictutor-db` → 2. RustFS buckets + key → 3. `arabictutor-api` (first deploy by ImageName; watch log
   for `migrate.done`) → 4. `arabictutor-worker` → 5. `arabictutor-web` + domain + HTTPS → 6. GitHub
   variables/secrets → 7. push to `main` and confirm the three deploy steps.
2. Open `https://arabictutor.<domain>/healthz` → `{ status: "ok", schemaRevision, queue: {...} }`.

## 8. Backups

- Nightly `pg_dump` of `arabictutor-db` (one-off container on the captain network, or a small
  `arabictutor-backup` app with a cron image) → off-box storage.
- Nightly `rclone sync` of `arabictutor-media/originals` and `arabictutor-uploads` → off-box storage.
- Monthly restore drill into a staging DB.

## 9. Capacity with Tabayyun on the same server

Tabayyun's guidance is 2 vCPU / 4 GB for its api + web. Suffa adds roughly 1–1.5 GB RAM
(api, worker, Postgres). Transcoding is CPU-heavy: keep `SUFFA_TRANSCODE_CONCURRENCY=1`, and
if you choose `faster-whisper` in the worker, run transcription at night. Recommended: **8 GB
RAM / 4 vCPU** for both apps together; watch disk (RustFS holds recordings for both).

## Troubleshooting

| Symptom                                                     | Cause                                                               | Fix                                                                                       |
| ----------------------------------------------------------- | ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Web log `lookup srv-captain--arabictutor-api: no such host` | app name/upstream mismatch                                          | `SUFFA_API_UPSTREAM=srv-captain--<api app>:8000` (two dashes)                             |
| Media URLs return `SignatureDoesNotMatch`                   | Host header not rewritten or endpoint differs between API and Caddy | Same value for `SUFFA_S3_ENDPOINT` host and `SUFFA_MEDIA_UPSTREAM`; keep `header_up Host` |
| Media `AccessDenied`                                        | key policy misses a bucket or `ListBucket`                          | Re-check policy in §2                                                                     |
| Worker exits code 3 repeatedly                              | api not yet migrated / version mismatch                             | Deploy api first; never run two api versions against one DB                               |
| API refuses to start in prod                                | placeholder or short secret                                         | Generate secrets as above, **Save & Update**                                              |
