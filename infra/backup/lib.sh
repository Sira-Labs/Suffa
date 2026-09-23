#!/bin/sh
# Shared helpers for the suffa-backup container (POSIX sh, busybox-compatible).

# One JSON log line on stdout: log <level> <msg> [key=value ...]
log() {
  level=$1; msg=$2; shift 2
  fields=""
  for kv in "$@"; do
    key=${kv%%=*}; value=${kv#*=}
    value=$(printf '%s' "$value" | sed 's/\\/\\\\/g; s/"/\\"/g')
    fields="$fields,\"$key\":\"$value\""
  done
  printf '{"ts":"%s","level":"%s","service":"suffa-backup","msg":"%s"%s}\n' \
    "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$level" "$msg" "$fields"
}

# Configures the rclone remote "backup" from SUFFA_BACKUP_* variables (no config file,
# no secrets on disk). SUFFA_BACKUP_LOCAL_DIR switches to a local directory (tests).
configure_remote() {
  # Everything comes from the environment; no rclone.conf is read or written.
  export RCLONE_CONFIG=/dev/null
  if [ -n "${SUFFA_BACKUP_LOCAL_DIR:-}" ]; then
    export RCLONE_CONFIG_BACKUP_TYPE=local
    BACKUP_ROOT="backup:${SUFFA_BACKUP_LOCAL_DIR}"
    return
  fi
  : "${SUFFA_BACKUP_S3_ENDPOINT:?SUFFA_BACKUP_S3_ENDPOINT is required}"
  : "${SUFFA_BACKUP_S3_BUCKET:?SUFFA_BACKUP_S3_BUCKET is required}"
  : "${SUFFA_BACKUP_S3_ACCESS_KEY_ID:?SUFFA_BACKUP_S3_ACCESS_KEY_ID is required}"
  : "${SUFFA_BACKUP_S3_SECRET_ACCESS_KEY:?SUFFA_BACKUP_S3_SECRET_ACCESS_KEY is required}"
  export RCLONE_CONFIG_BACKUP_TYPE=s3
  export RCLONE_CONFIG_BACKUP_PROVIDER="${SUFFA_BACKUP_S3_PROVIDER:-Other}"
  export RCLONE_CONFIG_BACKUP_ENDPOINT="$SUFFA_BACKUP_S3_ENDPOINT"
  export RCLONE_CONFIG_BACKUP_REGION="${SUFFA_BACKUP_S3_REGION:-us-east-1}"
  export RCLONE_CONFIG_BACKUP_ACCESS_KEY_ID="$SUFFA_BACKUP_S3_ACCESS_KEY_ID"
  export RCLONE_CONFIG_BACKUP_SECRET_ACCESS_KEY="$SUFFA_BACKUP_S3_SECRET_ACCESS_KEY"
  export RCLONE_CONFIG_BACKUP_FORCE_PATH_STYLE="${SUFFA_BACKUP_S3_PATH_STYLE:-true}"
  # The backup key may only write objects: never try to create or inspect the bucket.
  export RCLONE_CONFIG_BACKUP_NO_CHECK_BUCKET=true
  BACKUP_ROOT="backup:${SUFFA_BACKUP_S3_BUCKET}"
}

# Optional heartbeat (e.g. Uptime Kuma push monitor, healthchecks.io): ping_monitor ok|fail
ping_monitor() {
  [ -n "${SUFFA_BACKUP_PING_URL:-}" ] || return 0
  status=$1
  url="$SUFFA_BACKUP_PING_URL"
  case "$url" in
    *\?*) url="${url}&status=$( [ "$status" = ok ] && echo up || echo down )&msg=$2" ;;
    *) url="${url}?status=$( [ "$status" = ok ] && echo up || echo down )&msg=$2" ;;
  esac
  curl -fsS -m 10 -o /dev/null "$url" || log warn backup.ping_failed
}
