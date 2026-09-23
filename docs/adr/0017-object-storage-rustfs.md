# ADR-0017: Object storage on the existing RustFS (S3-compatible)

- Status: proposed
- Date: 2026-09-24
- Amends: ADR-0013 (replaces the optional MinIO app), ADR-0015 (audio retention store)

## Context

Suffa now needs file storage for teacher session recordings (originals + transcodes),
learner audio submissions, content bundles and exports. A **RustFS** app already runs on the
same CapRover (used by Tabayyun, `srv-captain--rustfs:9000`, S3 API, internal only). MinIO
community builds ended in 2025.

## Decision

- **Reuse the existing `rustfs` CapRover app**; do not run a second object store.
- Isolation by **bucket + dedicated access key** (same approach as Tabayyun's `tabayyun-cache`):
  `arabictutor-media` (recordings: originals, transcodes, transcripts), `arabictutor-uploads` (learner
  audio, teacher attachments), `arabictutor-content` (published content bundles, exports).
  One key `arabictutor-app` with object actions on those three buckets only.
- Access from code through an **`ObjectStorage` interface** (`put`, `get`, `head`, `delete`,
  `presignGet`, `presignPut`, `createMultipartUpload`) implemented with
  `@aws-sdk/client-s3` (`forcePathStyle: true`, endpoint from env). Any S3-compatible store is a
  drop-in (Hetzner Object Storage, Backblaze B2, Garage).
- **RustFS stays private.** Media is served through the web app's Caddy: route `/media/*`
  → `srv-captain--rustfs:9000` with the `Host` header set to the internal endpoint; the API
  hands out short-lived (15 min) **presigned** URLs signed for that host. The browser only sees
  same-origin `/media/...` URLs (clean CSP `media-src 'self'`, HTTP range requests for seeking
  work, no Node bandwidth).
- Large teacher uploads use **presigned multipart** (64 MB parts) so no single request hits
  proxy body-size limits.
- **Retention in our worker**, not bucket lifecycle rules (portable across stores):
  learner audio 30 days, orphaned uploads 7 days; transcodes are re-creatable.
- **Backups:** Postgres dumps are not enough — nightly `rclone sync` of `arabictutor-media/originals`
  and `arabictutor-uploads` to off-box storage; transcodes and bundles are regenerated.

## Alternatives

- Separate RustFS/MinIO app for Suffa: stronger isolation, more ops work, no real benefit now.
- Postgres large objects / filesystem volume: no presigning, poor for video, harder backups.
- Public RustFS domain with presigned URLs: works, but exposes the S3 endpoint publicly.

## Consequences

Shared blast radius with Tabayyun: a full disk affects both. Mitigation: disk alerts at
70/85 %, per-bucket size metrics in the admin panel, recordings capped per class (default
50 GB). Pin the RustFS image tag and upgrade deliberately (as Tabayyun already does).
