#!/bin/sh
# Restores a backup into a SEPARATE database for the monthly restore drill:
#   restore.sh latest | <object path below the bucket, e.g. postgres/daily/2026/09/suffa-….dump>
# Requires SUFFA_RESTORE_DATABASE_URL and refuses to touch SUFFA_BACKUP_DATABASE_URL.
set -eu
. /opt/suffa-backup/lib.sh

: "${SUFFA_RESTORE_DATABASE_URL:?SUFFA_RESTORE_DATABASE_URL is required (a scratch database)}"
if [ "${SUFFA_RESTORE_DATABASE_URL}" = "${SUFFA_BACKUP_DATABASE_URL:-}" ]; then
  log error restore.refused reason="target is the production database"
  exit 2
fi
configure_remote
prefix="${SUFFA_BACKUP_PREFIX:-postgres}"

object=${1:-latest}
if [ "$object" = latest ]; then
  object=$(rclone lsf -R --files-only "$BACKUP_ROOT/$prefix/daily" | sort | tail -n 1)
  [ -n "$object" ] || { log error restore.no_backup; exit 1; }
  object="$prefix/daily/$object"
fi

work=$(mktemp -d /tmp/suffa-restore.XXXXXX)
trap 'rm -rf "$work"' EXIT
log info restore.download object="$object"
rclone copyto "$BACKUP_ROOT/$object" "$work/restore.dump"
pg_restore --clean --if-exists --no-owner --no-privileges \
  --dbname="$SUFFA_RESTORE_DATABASE_URL" "$work/restore.dump"
log info restore.done object="$object"
