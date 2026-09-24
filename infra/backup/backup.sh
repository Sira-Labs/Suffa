#!/bin/sh
# Takes one verified Postgres backup and uploads it (ADR-0013).
#
#   daily/YYYY/MM/suffa-<timestamp>.dump     every run
#   monthly/YYYY/suffa-<timestamp>.dump      additionally on the 1st of the month
#
# Retention is enforced by the bucket (versioning + object lock + lifecycle rules), never by
# this script: the backup key cannot delete anything, which protects against a compromised host.
set -eu
. /opt/suffa-backup/lib.sh

: "${SUFFA_BACKUP_DATABASE_URL:?SUFFA_BACKUP_DATABASE_URL is required}"
configure_remote
prefix="${SUFFA_BACKUP_PREFIX:-postgres}"

stamp=$(date -u +%Y%m%dT%H%M%SZ)
work=$(mktemp -d /tmp/suffa-backup.XXXXXX)
trap 'rm -rf "$work"' EXIT
dump="$work/suffa-$stamp.dump"

started=$(date -u +%s)
log info backup.start stamp="$stamp"

# Custom format: compressed, restorable table by table, verifiable with pg_restore --list.
if ! pg_dump --format=custom --compress=9 --no-owner --no-privileges \
  --dbname="$SUFFA_BACKUP_DATABASE_URL" --file="$dump" 2>"$work/pg_dump.err"; then
  log error backup.dump_failed error="$(tail -n 3 "$work/pg_dump.err" | tr '\n' ' ')"
  ping_monitor fail dump_failed
  exit 1
fi
if ! pg_restore --list "$dump" >"$work/toc" 2>&1; then
  log error backup.verify_failed error="dump is not readable by pg_restore"
  ping_monitor fail verify_failed
  exit 1
fi
bytes=$(wc -c <"$dump" | tr -d ' ')
tables=$(grep -c ' TABLE DATA ' "$work/toc" || true)
sha256=$(sha256sum "$dump" | cut -d' ' -f1)

upload() {
  dest="$BACKUP_ROOT/$prefix/$1/suffa-$stamp.dump"
  # rclone sends Content-MD5 on every PUT/part, which object-lock buckets require.
  if ! rclone copyto "$dump" "$dest" --retries 5 --low-level-retries 10 \
    --stats-log-level NOTICE 2>"$work/rclone.err"; then
    log error backup.upload_failed dest="$dest" error="$(tail -n 3 "$work/rclone.err" | tr '\n' ' ')"
    ping_monitor fail upload_failed
    exit 1
  fi
  remote_bytes=$(rclone size --json "$dest" 2>/dev/null | sed -n 's/.*"bytes":\([0-9]*\).*/\1/p')
  if [ "$remote_bytes" != "$bytes" ]; then
    log error backup.size_mismatch dest="$dest" local="$bytes" remote="${remote_bytes:-missing}"
    ping_monitor fail size_mismatch
    exit 1
  fi
  log info backup.uploaded dest="$dest"
}

upload "daily/$(date -u +%Y/%m)"
if [ "$(date -u +%d)" = "01" ]; then upload "monthly/$(date -u +%Y)"; fi

log info backup.done stamp="$stamp" bytes="$bytes" tables="$tables" sha256="$sha256" \
  seconds="$(( $(date -u +%s) - started ))"
ping_monitor ok "backup_${bytes}_bytes"
