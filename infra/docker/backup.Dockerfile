# syntax=docker/dockerfile:1.7
# suffa-backup: nightly verified pg_dump of suffa-db, uploaded to S3-compatible storage
# (RustFS bucket with versioning + object lock). Scripts: infra/backup/, runbook:
# docs/ops/caprover-deployment.md. pg_dump must be >= the server version (Postgres 17).
FROM postgres:17-alpine
RUN apk add --no-cache rclone curl ca-certificates tzdata \
 && adduser -D -H -u 10001 backup
COPY --chmod=0755 infra/backup/ /opt/suffa-backup/
ENV HOME=/tmp
USER backup
ENTRYPOINT ["/opt/suffa-backup/entrypoint.sh"]
