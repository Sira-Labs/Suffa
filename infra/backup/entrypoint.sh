#!/bin/sh
# suffa-backup scheduler: runs backup.sh daily at SUFFA_BACKUP_TIME_UTC (default 02:30).
#   SUFFA_BACKUP_MODE=once          run one backup and exit (tests, manual runs)
#   SUFFA_BACKUP_RUN_ON_START=true  also run immediately after start (first deploy check)
# A failed run is logged (and pinged) but never stops the scheduler.
set -eu
. /opt/suffa-backup/lib.sh

if [ "${SUFFA_BACKUP_MODE:-schedule}" = once ]; then
  exec /opt/suffa-backup/backup.sh
fi

time_utc="${SUFFA_BACKUP_TIME_UTC:-02:30}"
case "$time_utc" in
  [0-2][0-9]:[0-5][0-9]) ;;
  *) log error backup.bad_time value="$time_utc"; exit 1 ;;
esac
hour=${time_utc%%:*}; minute=${time_utc##*:}
offset=$(( ${hour#0} * 3600 + ${minute#0} * 60 ))

# As PID 1 the shell ignores SIGTERM unless trapped. Children run in the background and are
# awaited, so `docker stop` / a CapRover redeploy ends the container immediately.
child=""
stop() {
  log info backup.stopping
  [ -n "$child" ] && kill -TERM "$child" 2>/dev/null
  exit 0
}
trap stop TERM INT

run_backup() {
  /opt/suffa-backup/backup.sh &
  child=$!
  wait "$child" || log error backup.run_failed
  child=""
}

if [ "${SUFFA_BACKUP_RUN_ON_START:-false}" = true ]; then
  run_backup
fi

while true; do
  now=$(date -u +%s)
  next=$(( now - now % 86400 + offset ))
  [ "$next" -gt "$now" ] || next=$(( next + 86400 ))
  log info backup.scheduled next="$(date -u -d "@$next" +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || echo "$next")"
  sleep $(( next - now )) &
  child=$!
  wait "$child"
  child=""
  run_backup
done
