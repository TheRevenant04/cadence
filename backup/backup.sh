#!/bin/sh
set -eu

mkdir -p /backups

while true; do
  ts="$(date +%Y%m%d-%H%M%S)"
  pg_dump -U "$PGUSER" -d "$PGDATABASE" -Fc -f "/backups/cadence_${ts}.dump"
  echo "[backup] wrote /backups/cadence_${ts}.dump"
  find /backups -name 'cadence_*.dump' -mtime +30 -delete
  sleep 3600
done